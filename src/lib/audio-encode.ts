/**
 * Browser-side audio processing for voice reference recordings.
 *
 * MediaRecorder gives us WebM/Opus (Chrome) or MP4/AAC (Safari), but the TTS
 * engine only accepts clean WAV. Everything here runs in the browser: decode →
 * mono → 24 kHz → trim silence → normalize → 16-bit PCM WAV.
 */

/** The model's native rate; matching it avoids a resample on the Python side. */
export const TARGET_SAMPLE_RATE = 24000;

/** The engine rejects references outside this window. */
export const MIN_DURATION = 3;
export const MAX_DURATION = 30;

/** Below this the recording is treated as silence when trimming the edges. */
const SILENCE_THRESHOLD = 0.012;
/** Keep a little air either side of speech so words don't start clipped. */
const SILENCE_PADDING_SECONDS = 0.08;
/** Leaves headroom so the reference never sits against full scale. */
const TARGET_PEAK = 0.95;

export interface ProcessedRecording {
  file: File;
  url: string;
  duration: number;
  sampleRate: number;
  /** Loudest sample before normalization — a value at 1.0 means the mic clipped. */
  inputPeak: number;
}

/**
 * Down-mix to mono and resample in a single offline render pass. Decoding
 * alone is not enough: Safari resamples to the live context's rate, so we
 * re-render through an OfflineAudioContext pinned to the rate we want.
 */
async function toMonoAtTargetRate(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();

  const decodeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(arrayBuffer);
  } finally {
    await decodeContext.close();
  }

  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  return offline.startRendering();
}

/** Drops leading and trailing silence, keeping a short pad around the speech. */
function trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
  let start = 0;
  let end = samples.length - 1;

  while (start < samples.length && Math.abs(samples[start]) < SILENCE_THRESHOLD) start++;
  while (end > start && Math.abs(samples[end]) < SILENCE_THRESHOLD) end--;

  // Nothing above the threshold — hand back the original rather than an empty clip
  if (start >= end) return samples;

  const pad = Math.floor(SILENCE_PADDING_SECONDS * sampleRate);
  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad + 1));
}

/** Scales the clip up or down to a consistent reference level. */
function normalize(samples: Float32Array): { samples: Float32Array; peak: number } {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
  }

  if (peak === 0) return { samples, peak };

  const gain = TARGET_PEAK / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;

  return { samples: out, peak };
}

/** Writes a 16-bit PCM mono WAV (44-byte canonical header). */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // format: PCM
  view.setUint16(22, 1, true);           // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Turn a raw MediaRecorder blob into an engine-ready WAV file.
 */
export async function processRecording(blob: Blob, fileName = 'recording.wav'): Promise<ProcessedRecording> {
  const rendered = await toMonoAtTargetRate(blob);
  const trimmed = trimSilence(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
  const { samples, peak } = normalize(trimmed);

  const wav = encodeWav(samples, TARGET_SAMPLE_RATE);
  const file = new File([wav], fileName, { type: 'audio/wav' });

  return {
    file,
    url: URL.createObjectURL(wav),
    duration: samples.length / TARGET_SAMPLE_RATE,
    sampleRate: TARGET_SAMPLE_RATE,
    inputPeak: peak,
  };
}

/** Picks a container the current browser can actually record. */
export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}
