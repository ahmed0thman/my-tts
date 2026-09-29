/**
 * Pure helpers for dubbing, shared by the actions (server) and the dub page
 * (client). No I/O here.
 */

/** Languages Whisper reports, for the ones people are likely to dub from. Anything else shows its code. */
const LANGUAGE_LABELS: Record<string, string> = {
  ar: 'عربي',
  en: 'إنجليزي',
  fr: 'فرنساوي',
  de: 'ألماني',
  es: 'إسباني',
  it: 'إيطالي',
  tr: 'تركي',
  ru: 'روسي',
  zh: 'صيني',
  ja: 'ياباني',
  ko: 'كوري',
  hi: 'هندي',
  ur: 'أوردو',
  fa: 'فارسي',
  pt: 'برتغالي',
};

export function languageLabel(code: string | null | undefined): string {
  if (!code) return 'غير معروف';
  return LANGUAGE_LABELS[code] ?? code;
}

/** What the transcription may be told the video is in; `auto` lets Whisper detect it. */
export const SOURCE_LANGUAGES = [
  { id: 'auto', label: 'اكتشاف تلقائي' },
  { id: 'ar', label: 'عربي' },
  { id: 'en', label: 'إنجليزي' },
] as const;

/** `1:05.3` — minutes, seconds and a tenth, for a line's place in the video. */
export function formatTimestamp(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}

/** The transcript as the user copies it out: one line per timed line, nothing else. */
export function transcriptText(lines: { sourceText: string | null; text: string }[]): string {
  return lines.map((line) => (line.sourceText ?? line.text).replace(/\s+/g, ' ').trim()).join('\n');
}

/**
 * A pasted translation → one text per line, or why it does not fit.
 *
 * The line count has to match: line N of the paste is spoken over line N's
 * seconds of video, so an extra or missing line would shift every line after
 * it onto the wrong picture. Blank lines are ignored. If every line starts
 * with its own number ("1. …", "2) …") — translators and chat tools like to
 * add them — the numbers are taken off; a single line that happens to start
 * with a number is left alone.
 */
export function parseTranslation(
  pasted: string,
  expected: number,
): { ok: true; lines: string[] } | { ok: false; count: number; error: string } {
  let lines = pasted
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const numbered = /^\s*[\[(]?(\d+)[\])]?[.)\-:،]?\s+/;
  if (lines.length > 1 && lines.every((line, index) => Number(numbered.exec(line)?.[1]) === index + 1)) {
    lines = lines.map((line) => line.replace(numbered, '').trim());
  }

  if (lines.length !== expected) {
    return {
      ok: false,
      count: lines.length,
      error: `النص فيه ${lines.length} سطر، والفيديو ${expected} سطر. لازم كل سطر يقابل سطر — راجع إن الترجمة ماجمعتش سطرين في سطر أو قسمت سطر لاتنين.`,
    };
  }
  return { ok: true, lines };
}

/**
 * Seconds a line's take has: its own slot, and the room before the next
 * line starts (or the video ends). The engine fits the take between them.
 */
export function lineTiming(
  line: { startMs: number | null; endMs: number | null },
  nextStartMs: number | null,
  videoSeconds: number,
): { slot: number; room: number } | null {
  if (line.startMs == null || line.endMs == null) return null;
  const slot = Math.max(0.3, (line.endMs - line.startMs) / 1000);
  const until = nextStartMs ?? Math.round(videoSeconds * 1000);
  const room = Math.max(slot, (until - line.startMs) / 1000 - 0.03);
  return { slot, room };
}

/** How a finished take sits in its place: fits, will be sped up at assembly, or will be cut. */
export type FitState = 'fits' | 'tight' | 'over';

/** Mirrors the engine's MAX_SPEEDUP (tts-engine/dubbing.py). */
export const MAX_SPEEDUP = 1.35;

export function fitState(duration: number, room: number): FitState {
  if (duration <= room + 0.05) return 'fits';
  if (duration <= room * MAX_SPEEDUP) return 'tight';
  return 'over';
}
