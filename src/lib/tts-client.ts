import { Agent, fetch as undiciFetch, FormData as UndiciFormData } from 'undici';

const TTS_ENGINE_URL = process.env.TTS_ENGINE_URL || 'http://localhost:8000';

/**
 * Generation holds the connection open with no bytes sent until the whole clip
 * is rendered, and undici gives up after 5 minutes by default — which silently
 * failed a Masri Higgs run that had already written its WAV to disk (210s to
 * load the model + 220s to render 30s of audio). Nothing is streamed
 * incrementally, so there is no keepalive to rely on; the timeouts simply have
 * to be longer than the slowest model.
 *
 * The request goes through undici's own `fetch`, not the global one. Node's
 * built-in fetch is powered by a *bundled* copy of undici and rejects a
 * dispatcher built by the npm package with `invalid onRequestStart method` —
 * the two versions do not share an interface. Importing both from the same
 * package keeps them consistent.
 */
const GENERATE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

const generateAgent = new Agent({
  headersTimeout: GENERATE_TIMEOUT_MS,
  bodyTimeout: GENERATE_TIMEOUT_MS,
  connectTimeout: 30_000,
});

export interface VoiceSample {
  filename: string;
  path: string;
  duration: number;
  size: number;
  created_at: number;
}

export interface HealthStatus {
  status: string;
  model_loaded: boolean;
  device: string;
  uptime: number;
  sample_rate: number | null;
}

export interface ModelInfo {
  model_name: string;
  base_model: string;
  device: string;
  sample_rate: number;
  is_loaded: boolean;
}

export interface GenerateSpeechParams {
  text: string;
  /** Which engine to render with — see tts-engine/model_registry.py. */
  modelId?: string;
  voiceProfilePath?: string;
  /** Transcription of the reference clip. Required only by models that declare requiresReferenceText. */
  referenceText?: string;
  /** Model-specific knobs, keyed by the `params` schema from GET /api/models. */
  params?: Record<string, number | string>;
  /** Absolute folder the generated WAV should be exported to. Defaults to storage/audio. */
  outputDir?: string;
}

export interface ModelParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  format?: string;
  integer?: boolean;
}

export interface TtsModel {
  id: string;
  label: string;
  dialect: string;
  repo: string;
  architecture: string;
  supportsVoiceCloning: boolean;
  requiresReferenceText: boolean;
  maxReferenceSeconds: number | null;
  notes: string;
  params: ModelParamSpec[];
}

export interface GenerateSpeechResult {
  audio_path: string;
  /** Absolute path the WAV was written to on disk. */
  saved_path: string;
  duration: number;
  file_size: number;
  /** True when the waveform ran past full scale and was scaled down before writing. */
  peak_normalized: boolean;
  /** The seed the engine used, when the model exposes one. */
  seed: string;
  /** Which model actually rendered it. */
  model_id: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  writable: boolean;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  writable: boolean;
  entries: DirectoryEntry[];
  shortcuts: { label: string; path: string }[];
  default_dir: string;
}

export interface DirectoryValidation {
  path: string;
  exists: boolean;
  writable: boolean;
  is_default: boolean;
}

/**
 * Generate speech from text via the TTS engine.
 * The FastAPI server expects multipart form data.
 */
export async function generateSpeech(params: GenerateSpeechParams): Promise<GenerateSpeechResult> {
  const formData = new UndiciFormData();
  formData.append('text', params.text);
  if (params.voiceProfilePath) {
    formData.append('voice_profile_path', params.voiceProfilePath);
  }
  formData.append('model_id', params.modelId ?? 'silma');
  if (params.referenceText) {
    formData.append('reference_text', params.referenceText);
  }
  // Parameter names differ per backend, so they travel as a JSON blob.
  formData.append('params', JSON.stringify(params.params ?? {}));
  if (params.outputDir) {
    formData.append('output_dir', params.outputDir);
  }

  const response = await undiciFetch(`${TTS_ENGINE_URL}/api/generate`, {
    method: 'POST',
    body: formData,
    dispatcher: generateAgent,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate speech: ${error}`);
  }

  const audioPath = response.headers.get('X-Audio-Path') || '';
  const savedPath = response.headers.get('X-Saved-Path') || '';
  const duration = parseFloat(response.headers.get('X-Duration') || '0');
  const peakNormalized = response.headers.get('X-Peak-Normalized') === 'true';
  const seed = response.headers.get('X-Seed') || '';
  const modelId = response.headers.get('X-Model-Id') || '';

  // Read the blob to get file size
  const audioBlob = await response.blob();
  const fileSize = audioBlob.size;

  return {
    audio_path: audioPath,
    saved_path: savedPath,
    duration,
    file_size: fileSize,
    peak_normalized: peakNormalized,
    seed,
    model_id: modelId,
  };
}

/**
 * List sub-directories of a path, for the save-location picker.
 */
export async function browseDirectories(path?: string): Promise<DirectoryListing> {
  const url = new URL(`${TTS_ENGINE_URL}/api/fs/browse`);
  if (path) url.searchParams.set('path', path);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to browse directories: ${error}`);
  }
  return response.json();
}

/**
 * Check whether a typed-in save folder exists and is writable.
 */
export async function validateDirectory(path: string): Promise<DirectoryValidation> {
  const url = new URL(`${TTS_ENGINE_URL}/api/fs/validate`);
  url.searchParams.set('path', path);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to validate directory: ${error}`);
  }
  return response.json();
}

/**
 * Upload a reference voice sample to the TTS engine.
 */
export async function uploadReference(file: File): Promise<{ filename: string; path: string; duration: number; sample_rate: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${TTS_ENGINE_URL}/api/upload-reference`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload reference: ${error}`);
  }

  return response.json();
}

/**
 * List all available voice samples from the TTS engine storage.
 */
export async function listVoices(): Promise<VoiceSample[]> {
  const response = await fetch(`${TTS_ENGINE_URL}/api/voices`);
  if (!response.ok) {
    throw new Error(`Failed to list voices: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Delete a voice sample by filename.
 */
export async function deleteVoice(filename: string): Promise<void> {
  const response = await fetch(`${TTS_ENGINE_URL}/api/voices/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete voice: ${response.statusText}`);
  }
}

export interface EngineProgress {
  state: 'idle' | 'loading' | 'generating' | 'error';
  model_id: string | null;
  detail: string;
  chunk: number;
  chunks: number;
  frames: number;
  /** Seconds of audio rendered so far in the current chunk. */
  audio_seconds: number;
  elapsed: number;
  /** Chunk-based, and deliberately capped below 100 — the model decides when a sentence ends. */
  percent: number | null;
  error: string | null;
}

/**
 * What the engine is doing right now. Polled while a generation is pending.
 */
export async function getProgress(): Promise<EngineProgress> {
  const response = await fetch(`${TTS_ENGINE_URL}/api/progress`);
  if (!response.ok) {
    throw new Error(`Failed to get progress: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get TTS engine health status.
 */
export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch(`${TTS_ENGINE_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Failed to get health status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List every model the engine can run, with its capabilities and parameter schema.
 */
export async function listModels(): Promise<{ models: TtsModel[]; default: string; active: string | null }> {
  const response = await fetch(`${TTS_ENGINE_URL}/api/models`);
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get model metadata and info.
 */
export async function getModelInfo(): Promise<ModelInfo> {
  const response = await fetch(`${TTS_ENGINE_URL}/api/model-info`);
  if (!response.ok) {
    throw new Error(`Failed to get model info: ${response.statusText}`);
  }
  return response.json();
}
