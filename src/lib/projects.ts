/**
 * Pure helpers shared by the project actions (server) and the project page
 * (client). No I/O here.
 */

export type SplitMode = 'line' | 'paragraph';

/**
 * Break a script into segments.
 *
 * `line` makes every non-empty line a segment — fine-grained, so a bad take
 * costs one sentence to redo. `paragraph` splits on blank lines, keeping the
 * lines of a paragraph together, which gives the model more context for
 * prosody at the cost of longer retakes.
 */
export function splitScript(script: string, mode: SplitMode): string[] {
  const normalized = script.replace(/\r\n?/g, '\n');
  const parts = mode === 'paragraph' ? normalized.split(/\n\s*\n/) : normalized.split('\n');
  return parts.map((part) => part.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
}

/**
 * Identifies exactly which takes, in which order, a merge was built from.
 * A retake changes a segment's audioPath, moving changes the order, and
 * adding or deleting changes the list — any of them makes the stored merge
 * stale, and all of them change this string.
 */
export function mergeSignature(segments: { id: string; audioPath: string | null }[]): string {
  return segments.map((s) => `${s.id}:${s.audioPath ?? ''}`).join('|');
}

/** Egyptian Arabic runs ~2.6 words a second; used for estimates before anything is rendered. */
export function estimateSeconds(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return words / 2.6;
}

/** What an episode is. Stored as a plain string so adding a kind needs no migration. */
export const EPISODE_KINDS = [
  { id: 'episode', label: 'حلقة' },
  { id: 'short', label: 'شورت' },
  { id: 'other', label: 'صوت تاني' },
] as const;

export type EpisodeKind = (typeof EPISODE_KINDS)[number]['id'];

export function episodeKindLabel(kind: string): string {
  return EPISODE_KINDS.find((k) => k.id === kind)?.label ?? kind;
}
