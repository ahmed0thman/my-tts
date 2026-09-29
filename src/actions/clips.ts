'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { deleteStoredAudio } from '@/lib/storage';
import { copyStoredAudio, insertSegmentAt, IMPORTED_MODEL_ID } from '@/lib/clips';
import { clipNameSchema } from '@/lib/validations';

/**
 * The clip library: audio saved to reuse across episodes — an intro, a
 * sign-off, a recording of the user's own voice. Uploads and recordings are
 * Route Handlers (/api/clips, /api/episodes/[id]/audio) because of their
 * size; everything that moves no audio through the request is here.
 */

function fail(error: any, fallback = 'حصل خطأ غير متوقع') {
  return { success: false as const, error: error?.errors?.[0]?.message || error?.message || fallback };
}

export async function getClips() {
  try {
    const clips = await prisma.clip.findMany({ orderBy: { createdAt: 'desc' } });
    return { success: true as const, data: clips };
  } catch (error) {
    return fail(error);
  }
}

export async function renameClip(id: string, name: string) {
  try {
    const clip = await prisma.clip.update({ where: { id }, data: { name: clipNameSchema.parse(name) } });
    revalidatePath('/library');
    return { success: true as const, data: clip };
  } catch (error) {
    return fail(error);
  }
}

/** Episodes that used the clip keep their own copies. */
export async function deleteClip(id: string) {
  try {
    const clip = await prisma.clip.delete({ where: { id } });
    await deleteStoredAudio(clip.audioPath);
    revalidatePath('/library');
    return { success: true as const };
  } catch (error) {
    return fail(error);
  }
}

/** Place a copy of a library clip in an episode, at `position` (the end when null). */
export async function insertClipIntoEpisode(episodeId: string, clipId: string, position: number | null) {
  try {
    const clip = await prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) return { success: false as const, error: 'المقطع ده مش موجود في المكتبة' };
    const copy = await copyStoredAudio(clip.audioPath, 'audio');
    const segment = await insertSegmentAt(episodeId, position, {
      text: clip.name,
      source: 'library',
      modelId: IMPORTED_MODEL_ID,
      status: 'COMPLETED',
      audioPath: copy.audioPath,
      duration: clip.duration,
      fileSize: copy.fileSize,
    });
    revalidatePath('/projects');
    return { success: true as const, data: { id: segment.id } };
  } catch (error) {
    return fail(error);
  }
}

/** Save a copy of a segment's (or any take's) audio to the library. */
export async function saveToLibrary(generationId: string, name: string) {
  try {
    const row = await prisma.generation.findUnique({ where: { id: generationId } });
    if (!row?.audioPath || row.status !== 'COMPLETED') {
      return { success: false as const, error: 'المقطع ده مفيهوش صوت يتحفظ' };
    }
    const copy = await copyStoredAudio(row.audioPath, 'clips');
    const clip = await prisma.clip.create({
      data: {
        name: clipNameSchema.parse(name),
        source: 'segment',
        audioPath: copy.audioPath,
        duration: row.duration ?? 0,
        fileSize: copy.fileSize,
      },
    });
    revalidatePath('/library');
    return { success: true as const, data: clip };
  } catch (error) {
    return fail(error);
  }
}
