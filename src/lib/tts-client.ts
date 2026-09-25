import path from 'node:path';
import { Agent, fetch as undiciFetch, FormData as UndiciFormData } from 'undici';
import type { RequestInit as UndiciRequestInit } from 'undici';
import { DEFAULT_MODEL_ID } from './models';

/**
 * Where the engine listens: a Unix domain socket, not a TCP port.
 *
 * Ports 8000 and 3000 kept colliding with other projects on the machine, and
 * no port number is ever guaranteed free. A socket file cannot collide, and
 * nothing on the network can reach it. The default is derived the same way by
 * every launcher (scripts/dev.sh, electron/processes.js) and by the engine
 * itself (tts-engine/main.py), and SAWTAK_ENGINE_SOCKET overrides it in all of
 * them.
 *
 * TTS_ENGINE_URL is the escape hatch back to TCP — an engine on another
 * machine, say. When it is set the socket is not used.
 */
export const ENGINE_SOCKET =
  process.env.SAWTAK_ENGINE_SOCKET ||
  path.join(process.env.SAWTAK_DATA_ROOT || process.cwd(), 'storage', 'run', 'engine.sock');

const ENGINE_URL_OVERRIDE = process.env.TTS_ENGINE_URL || '';

/** Over a socket the host part is never resolved; it only fills the Host header. */
const ENGINE_BASE = ENGINE_URL_OVERRIDE || 'http://sawtak-engine';

/** Human-readable address, for the settings page. */
export const ENGINE_ADDRESS = ENGINE_URL_OVERRIDE || `unix:${ENGINE_SOCKET}`;

const connect = ENGINE_URL_OVERRIDE ? undefined : { socketPath: ENGINE_SOCKET };

/**
 * Generation holds the connection open with no bytes sent until the whole clip
 * is rendered, and undici gives up after 5 minutes by default — which silently
 * failed a Masri Higgs run that had already written its WAV to disk (210s to
 * load the model + 220s to render 30s of audio). Nothing is streamed
 * incrementally, so there is no keepalive to rely on; the timeouts simply have
 * to be longer than the slowest model.
 *
 * Every request goes through undici's own `fetch`, not the global one. Node's
 * built-in fetch is powered by a *bundled* copy of undici and rejects a
 * dispatcher built by the npm package with `invalid onRequestStart method` —
 * the two versions do not share an interface. Importing both from the same
 * package keeps them consistent. The dispatcher is also what carries the
 * socket path, so the global fetch cannot reach the engine at all.
 */
const LONG_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

const engineAgent = new Agent({ connect });

const longAgent = new Agent({
  headersTimeout: LONG_TIMEOUT_MS,
  bodyTimeout: LONG_TIMEOUT_MS,
  connectTimeout: 30_000,
  connect,
});

function engineUrl(pathname: string, query?: Record<string, string | undefined>): string {
  const url = new URL(pathname, ENGINE_BASE);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

function engineFetch(pathname: string, init: UndiciRequestInit & { long?: boolean } = {}) {
  const { long, ...rest } = init;
  return undiciFetch(engineUrl(pathname), { ...rest, dispatcher: long ? longAgent : engineAgent });
}

/**
 * FastAPI puts the message in `detail`, and for a 400 that message is written
 * for the user in Arabic — it has to reach the toast intact rather than as a
 * JSON blob behind an English prefix.
 */
async function engineError(response: Awaited<ReturnType<typeof undiciFetch>>, prefix: string): Promise<Error> {
  const body = await response.text();
  let detail = body;
  try {
    detail = JSON.parse(body).detail ?? body;
  } catch {
    // Not JSON; the raw body is the best we have.
  }
  return new Error(response.status === 400 ? detail : `${prefix}: ${detail}`);
}

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
  formData.append('model_id', params.modelId ?? DEFAULT_MODEL_ID);
  if (params.referenceText) {
    formData.append('reference_text', params.referenceText);
  }
  // Parameter names differ per backend, so they travel as a JSON blob.
  formData.append('params', JSON.stringify(params.params ?? {}));
  if (params.outputDir) {
    formData.append('output_dir', params.outputDir);
  }

  const response = await engineFetch('/api/generate', {
    method: 'POST',
    body: formData,
    long: true,
  });

  if (!response.ok) {
    throw await engineError(response, 'Failed to generate speech');
  }

  const audioPath = response.headers.get('X-Audio-Path') || '';
  const savedPath = response.headers.get('X-Saved-Path') || '';
  const duration = parseFloat(response.headers.get('X-Duration') || '0');
  const peakNormalized = response.headers.get('X-Peak-Normalized') === 'true';
  const seed = response.headers.get('X-Seed') || '';
  const modelId = response.headers.get('X-Model-Id') || '';

  // Read the body to get the file size (and to release the connection).
  const fileSize = (await response.arrayBuffer()).byteLength;

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
  const response = await undiciFetch(engineUrl('/api/fs/browse', { path }), {
    dispatcher: engineAgent,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to browse directories: ${error}`);
  }
  return (await response.json()) as DirectoryListing;
}

/**
 * Check whether a typed-in save folder exists and is writable.
 */
export async function validateDirectory(path: string): Promise<DirectoryValidation> {
  const response = await undiciFetch(engineUrl('/api/fs/validate', { path }), {
    dispatcher: engineAgent,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to validate directory: ${error}`);
  }
  return (await response.json()) as DirectoryValidation;
}

/**
 * Upload a reference voice sample to the TTS engine.
 */
export async function uploadReference(file: File): Promise<{ filename: string; path: string; duration: number; sample_rate: number }> {
  const formData = new UndiciFormData();
  formData.append('file', file);

  const response = await engineFetch('/api/upload-reference', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw await engineError(response, 'Failed to upload reference');
  }

  return (await response.json()) as { filename: string; path: string; duration: number; sample_rate: number };
}

/**
 * List all available voice samples from the TTS engine storage.
 */
export async function listVoices(): Promise<VoiceSample[]> {
  const response = await engineFetch('/api/voices');
  if (!response.ok) {
    throw new Error(`Failed to list voices: ${response.statusText}`);
  }
  return (await response.json()) as VoiceSample[];
}

/**
 * Delete a voice sample by filename.
 */
export async function deleteVoice(filename: string): Promise<void> {
  const response = await engineFetch(`/api/voices/${encodeURIComponent(filename)}`, {
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
  const response = await engineFetch('/api/progress');
  if (!response.ok) {
    throw new Error(`Failed to get progress: ${response.statusText}`);
  }
  return (await response.json()) as EngineProgress;
}

/**
 * Get TTS engine health status.
 */
export async function getHealth(): Promise<HealthStatus> {
  const response = await engineFetch('/api/health');
  if (!response.ok) {
    throw new Error(`Failed to get health status: ${response.statusText}`);
  }
  return (await response.json()) as HealthStatus;
}

/**
 * List every model the engine can run, with its capabilities and parameter schema.
 */
export async function listModels(): Promise<{ models: TtsModel[]; default: string; active: string | null }> {
  const response = await engineFetch('/api/models');
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }
  return (await response.json()) as { models: TtsModel[]; default: string; active: string | null };
}

/**
 * Get model metadata and info.
 */
export async function getModelInfo(): Promise<ModelInfo> {
  const response = await engineFetch('/api/model-info');
  if (!response.ok) {
    throw new Error(`Failed to get model info: ${response.statusText}`);
  }
  return (await response.json()) as ModelInfo;
}

export interface MergeAudioResult {
  audio_path: string;
  /** Absolute path of the exported copy (the chosen folder, or storage/audio). */
  saved_path: string;
  duration: number;
  sample_rate: number;
  file_size: number;
  clips: number;
}

/**
 * Join generated clips, in the order given, into one WAV — how a project's
 * segments become an episode. `paths` are the `audioPath` values as stored.
 */
export async function mergeAudio(params: {
  paths: string[];
  gapMs: number;
  outputDir?: string;
  /** Stem for the exported copy's filename, usually the project title. */
  filenameHint?: string;
}): Promise<MergeAudioResult> {
  const formData = new UndiciFormData();
  formData.append('paths', JSON.stringify(params.paths));
  formData.append('gap_ms', String(Math.round(params.gapMs)));
  if (params.outputDir) formData.append('output_dir', params.outputDir);
  if (params.filenameHint) formData.append('filename_hint', params.filenameHint);

  // An hour of audio takes a while to resample and write; not model-bound,
  // but still longer than the default timeouts should have to cover.
  const response = await engineFetch('/api/merge', { method: 'POST', body: formData, long: true });
  if (!response.ok) {
    throw await engineError(response, 'Failed to merge audio');
  }
  return (await response.json()) as MergeAudioResult;
}
