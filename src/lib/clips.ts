import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { STORAGE_ROOT } from './storage';
import { importAudio } from './tts-client';
import type { Prisma } from '@prisma/client';

/**
 * Audio the user brings in rather than generates: uploads, recordings, and
 * the clip library (storage/clips/). Server-only.
 *
 * Every insert is a copy. A library clip placed in an episode becomes its own
 * `gen_*.wav`, so deleting the segment (which deletes its file) or editing it
 * in the editor never touches the saved clip, and the other way round.
 */

/** Where an episode segment's audio came from — see `Generation.source`. */
export type SegmentSource = 'tts' | 'upload' | 'recording' | 'library';
/** Where a library clip came from. */
export type ClipSource = 'upload' | 'recording' | 'segment';

/** `Generation.modelId` for audio no model rendered. */
export const IMPORTED_MODEL_ID = 'imported';

const CLIPS_DIR = 'clips';

function resolveStored(stored: string): string {
  const relative = stored.replace(/^\/?storage\//, '');
  const absolute = path.resolve(STORAGE_ROOT, relative);
  if (!absolute.startsWith(STORAGE_ROOT + path.sep)) throw new Error('مسار الملف مش صحيح');
  return absolute;
}

/** Copy a stored file under a new name in storage/audio (a segment) or storage/clips (a library clip). */
export async function copyStoredAudio(stored: string, to: 'audio' | 'clips') {
  const folder = path.join(STORAGE_ROOT, to);
  await fs.mkdir(folder, { recursive: true });
  const name = `${to === 'clips' ? 'clip' : 'gen'}_${randomUUID()}.wav`;
  const target = path.join(folder, name);
  await fs.copyFile(resolveStored(stored), target);
  const { size } = await fs.stat(target);
  return { audioPath: `/storage/${to}/${name}`, fileSize: size };
}

/**
 * Store a WAV from the browser (already decoded to mono there, see
 * src/lib/audio-encode.ts) through the engine's import path, which brings it
 * to 24 kHz like every take, then move it into place.
 */
export async function importToStorage(file: Blob, to: 'audio' | 'clips') {
  const result = await importAudio({ file, kind: 'segment' });
  if (to === 'audio') {
    return { audioPath: result.audio_path, duration: result.duration, fileSize: result.file_size };
  }
  const folder = path.join(STORAGE_ROOT, CLIPS_DIR);
  await fs.mkdir(folder, { recursive: true });
  const name = `clip_${randomUUID()}.wav`;
  await fs.rename(resolveStored(result.audio_path), path.join(folder, name));
  return { audioPath: `/storage/${CLIPS_DIR}/${name}`, duration: result.duration, fileSize: result.file_size };
}

/**
 * Create a finished segment at `index` in the episode's running order (the
 * end when omitted or out of range), renumbering every slot after it.
 */
export async function insertSegmentAt(
  episodeId: string,
  index: number | null | undefined,
  data: Omit<Prisma.GenerationUncheckedCreateInput, 'episodeId' | 'position'>,
) {
  const ordered = await prisma.generation.findMany({
    where: { episodeId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const at = index == null || !Number.isFinite(index) ? ordered.length : Math.max(0, Math.min(ordered.length, index));

  return prisma.$transaction(async (tx) => {
    const row = await tx.generation.create({ data: { ...data, episodeId, position: at } });
    const ids = ordered.map((s) => s.id);
    ids.splice(at, 0, row.id);
    for (let position = 0; position < ids.length; position++) {
      if (ids[position] !== row.id) {
        await tx.generation.update({ where: { id: ids[position] }, data: { position } });
      }
    }
    return row;
  });
}
