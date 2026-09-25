'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { mergeAudio } from '@/lib/tts-client';
import { renderGeneration, resolveVoiceReference } from '@/lib/render';
import { deleteStoredAudio } from '@/lib/storage';
import { mergeSignature } from '@/lib/projects';
import {
  addSegmentsSchema,
  episodeSchema,
  mergeSchema,
  renderSettingsSchema,
  segmentTextSchema,
  type EpisodeFormValues,
  type RenderSettings,
} from '@/lib/validations';

/**
 * An episode is one finished piece of audio inside a project — a long episode,
 * a short, anything. Its segments are Generation rows; merging joins them, in
 * running order, into one WAV.
 */

/** Running order: slot first, creation time as the tie-break for rows written in the same slot. */
const SEGMENT_ORDER = [{ position: 'asc' as const }, { createdAt: 'asc' as const }];

function fail(error: any, fallback = 'حصل خطأ غير متوقع') {
  return { success: false as const, error: error?.errors?.[0]?.message || error?.message || fallback };
}

export async function getEpisode(id: string) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, title: true } },
        segments: { orderBy: SEGMENT_ORDER, include: { voiceProfile: true } },
      },
    });
    if (!episode) return { success: false as const, error: 'الحلقة مش موجودة' };

    // Compared here so the client does not need to know how the signature is built.
    const mergeIsCurrent =
      !!episode.mergedAudioPath && episode.mergedSignature === mergeSignature(episode.segments);
    return { success: true as const, data: { ...episode, mergeIsCurrent } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * A new episode starts with the voice of the project's most recently edited
 * one: episodes of the same series usually share a narrator, and re-picking
 * the model, voice and every knob for each short is exactly the chore a
 * project should remove.
 */
export async function createEpisode(projectId: string, input: EpisodeFormValues) {
  try {
    const data = episodeSchema.parse(input);
    const previous = await prisma.episode.findFirst({
      where: { projectId, modelId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { modelId: true, voiceProfileId: true, params: true, outputDir: true, gapMs: true },
    });

    const episode = await prisma.episode.create({
      data: {
        projectId,
        title: data.title,
        description: data.description || null,
        kind: data.kind,
        ...(previous && {
          modelId: previous.modelId,
          voiceProfileId: previous.voiceProfileId,
          params: previous.params ?? undefined,
          outputDir: previous.outputDir,
          gapMs: previous.gapMs,
        }),
      },
    });
    revalidatePath('/projects');
    return { success: true as const, data: episode };
  } catch (error) {
    return fail(error);
  }
}

export async function updateEpisode(id: string, input: EpisodeFormValues) {
  try {
    const data = episodeSchema.parse(input);
    const episode = await prisma.episode.update({
      where: { id },
      data: { title: data.title, description: data.description || null, kind: data.kind },
    });
    revalidatePath('/projects');
    return { success: true as const, data: episode };
  } catch (error) {
    return fail(error);
  }
}

/** Deletes the episode, its segment rows, and their audio in storage/. An exported copy is left alone. */
export async function deleteEpisode(id: string) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id },
      include: { segments: { select: { audioPath: true } } },
    });
    if (!episode) return { success: false as const, error: 'الحلقة مش موجودة' };

    await prisma.episode.delete({ where: { id } });
    await Promise.all([
      ...episode.segments.map((s) => deleteStoredAudio(s.audioPath)),
      deleteStoredAudio(episode.mergedAudioPath),
    ]);

    revalidatePath('/projects');
    return { success: true as const, data: { projectId: episode.projectId } };
  } catch (error) {
    return fail(error);
  }
}

/** Remember the voice an episode renders with, so reopening it next week gives the same voice. */
async function rememberSettings(episodeId: string, settings: RenderSettings) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      modelId: settings.modelId,
      params: settings.params,
      voiceProfileId: settings.voiceProfileId || null,
      outputDir: settings.outputDir || null,
    },
  });
}

/**
 * Queue segments at the end of the running order, as PENDING rows.
 *
 * Nothing is rendered here. Writing the whole queue first means a long
 * episode survives the user navigating away or the app closing mid-way: the
 * rows are already there, and "continue" picks up the ones still pending. The
 * page then renders them one at a time with `renderSegment`.
 */
export async function addSegments(episodeId: string, input: { texts: string[]; settings: RenderSettings }) {
  try {
    const { texts, settings } = addSegmentsSchema.parse(input);
    const voiceProfileId = settings.voiceProfileId || null;

    // A voice the model cannot use would fail every segment; say so once.
    const reference = await resolveVoiceReference(voiceProfileId, settings.modelId);
    if (!reference.ok) return { success: false as const, error: reference.error };

    const last = await prisma.generation.aggregate({
      where: { episodeId },
      _max: { position: true },
    });
    const start = (last._max.position ?? -1) + 1;

    const created = await prisma.$transaction(
      texts.map((text, index) =>
        prisma.generation.create({
          data: {
            episodeId,
            position: start + index,
            text,
            modelId: settings.modelId,
            params: settings.params,
            voiceProfileId,
            status: 'PENDING',
          },
          select: { id: true },
        }),
      ),
    );

    await rememberSettings(episodeId, settings);
    revalidatePath('/projects');
    return { success: true as const, data: created.map((row) => row.id) };
  } catch (error) {
    return fail(error);
  }
}

/** Render a queued (or failed) segment with the settings stored on it. */
export async function renderSegment(id: string) {
  try {
    return await renderGeneration(id);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Render a segment again, in its own slot, optionally with new text or with
 * the episode's current voice settings. A finished segment keeps its old take
 * if the retake fails.
 */
export async function retakeSegment(id: string, input: { text?: string; settings?: RenderSettings }) {
  try {
    const text = input.text !== undefined ? segmentTextSchema.parse(input.text) : undefined;
    const settings = input.settings ? renderSettingsSchema.parse(input.settings) : undefined;

    const result = await renderGeneration(id, {
      overrides: {
        text,
        ...(settings && {
          modelId: settings.modelId,
          params: settings.params,
          voiceProfileId: settings.voiceProfileId || null,
        }),
      },
    });
    if (result.success && settings && result.data?.episodeId) {
      await rememberSettings(result.data.episodeId, settings);
    }
    return result;
  } catch (error) {
    return fail(error);
  }
}

/**
 * Edit a segment that has no audio yet. A finished segment is edited through
 * `retakeSegment` instead, so its text never disagrees with its audio.
 */
export async function updateSegmentText(id: string, text: string) {
  try {
    const value = segmentTextSchema.parse(text);
    const row = await prisma.generation.findUnique({ where: { id } });
    if (!row) return { success: false as const, error: 'المقطع مش موجود' };
    if (row.status === 'COMPLETED') {
      return { success: false as const, error: 'المقطع ده متولّد بالفعل — عدّله بإعادة التوليد' };
    }
    const updated = await prisma.generation.update({
      where: { id },
      data: { text: value, status: 'PENDING', error: null },
    });
    return { success: true as const, data: updated };
  } catch (error) {
    return fail(error);
  }
}

/** Swap a segment with its neighbour in the running order. */
export async function moveSegment(id: string, direction: 'up' | 'down') {
  try {
    const row = await prisma.generation.findUnique({ where: { id } });
    if (!row?.episodeId) return { success: false as const, error: 'المقطع مش موجود' };

    const ordered = await prisma.generation.findMany({
      where: { episodeId: row.episodeId },
      orderBy: SEGMENT_ORDER,
      select: { id: true },
    });
    const index = ordered.findIndex((s) => s.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) return { success: true as const };

    // Rewrite every slot rather than swapping two numbers: gaps left by
    // deletions and ties would otherwise make a swap a no-op.
    const next = ordered.map((s) => s.id);
    [next[index], next[target]] = [next[target], next[index]];
    await prisma.$transaction(
      next.map((segmentId, position) =>
        prisma.generation.update({ where: { id: segmentId }, data: { position } }),
      ),
    );
    return { success: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSegment(id: string) {
  try {
    const row = await prisma.generation.findUnique({ where: { id } });
    if (!row) return { success: false as const, error: 'المقطع مش موجود' };
    await prisma.generation.delete({ where: { id } });
    await deleteStoredAudio(row.audioPath);
    return { success: true as const };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Join every segment, in running order, into one WAV.
 *
 * Refuses while any segment is unfinished: audio silently missing a sentence
 * is worse than audio that is not ready yet. The previous merge's file in
 * storage/ is replaced; a copy exported to the user's folder is theirs and is
 * never touched.
 */
export async function mergeEpisode(id: string, input: { gapMs: number; outputDir?: string }) {
  try {
    const { gapMs, outputDir } = mergeSchema.parse(input);
    const episode = await prisma.episode.findUnique({
      where: { id },
      include: { project: { select: { title: true } }, segments: { orderBy: SEGMENT_ORDER } },
    });
    if (!episode) return { success: false as const, error: 'الحلقة مش موجودة' };
    if (episode.segments.length === 0) {
      return { success: false as const, error: 'لسه مفيش مقاطع' };
    }

    const unfinished = episode.segments
      .map((s, index) => ({ s, number: index + 1 }))
      .filter(({ s }) => s.status !== 'COMPLETED' || !s.audioPath);
    if (unfinished.length > 0) {
      const numbers = unfinished.slice(0, 8).map(({ number }) => number).join('، ');
      return {
        success: false as const,
        error: `لسه فيه ${unfinished.length} مقطع مش جاهز (رقم ${numbers}${unfinished.length > 8 ? '…' : ''}). ولّدهم أو امسحهم الأول.`,
      };
    }

    const result = await mergeAudio({
      paths: episode.segments.map((s) => s.audioPath!),
      gapMs,
      outputDir: outputDir || undefined,
      // One export folder usually holds a whole series; the project name keeps them apart.
      filenameHint: `${episode.project.title} - ${episode.title}`,
    });

    const updated = await prisma.episode.update({
      where: { id },
      data: {
        gapMs,
        outputDir: outputDir || null,
        mergedAudioPath: result.audio_path,
        mergedSavedPath: result.saved_path,
        mergedDuration: result.duration,
        mergedAt: new Date(),
        mergedSignature: mergeSignature(episode.segments),
      },
    });
    if (episode.mergedAudioPath && episode.mergedAudioPath !== result.audio_path) {
      await deleteStoredAudio(episode.mergedAudioPath);
    }

    revalidatePath('/projects');
    return { success: true as const, data: updated };
  } catch (error) {
    return fail(error);
  }
}
