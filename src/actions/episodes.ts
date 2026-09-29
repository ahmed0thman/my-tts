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

/** Audio the user brought in (upload, recording, library) has nothing to render. */
async function refuseImported(id: string) {
  const row = await prisma.generation.findUnique({ where: { id }, select: { source: true } });
  if (row && row.source !== 'tts') {
    return { success: false as const, error: 'ده صوت متضاف مش متولّد، فمينفعش يتولّد تاني — عدّله في المحرر أو امسحه' };
  }
  return null;
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

/**
 * Render a segment with the settings stored on it — a queued or failed one, or
 * a finished one being re-voiced in bulk (`voiceProfileId`, `null` for the
 * model's own voice) or regenerated in bulk with the sidebar's model and knobs
 * (`modelId` + `params`; the segment keeps its own voice).
 */
export async function renderSegment(
  id: string,
  overrides: { voiceProfileId?: string | null; modelId?: string; params?: Record<string, number> } = {},
) {
  try {
    const refused = await refuseImported(id);
    if (refused) return refused;
    const model =
      overrides.modelId !== undefined
        ? renderSettingsSchema.pick({ modelId: true, params: true }).parse({
            modelId: overrides.modelId,
            params: overrides.params ?? {},
          })
        : null;
    return await renderGeneration(id, {
      overrides: {
        ...(overrides.voiceProfileId !== undefined && { voiceProfileId: overrides.voiceProfileId }),
        ...(model && { modelId: model.modelId, params: model.params }),
      },
    });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Render a segment again, in its own slot, optionally with new text, a new
 * voice, or the episode's current model settings. A finished segment keeps its
 * old take if the retake fails.
 *
 * The voice is the segment's own: `settings` carries the model and its knobs,
 * and its `voiceProfileId` is ignored. A segment changes voice only when one
 * is asked for (`voiceProfileId`, `null` for the model's own voice) — taking
 * the sidebar's voice implicitly made a retake silently re-voice a segment in
 * a multi-speaker episode, and made the voice a segment rendered with
 * impossible to tell from the page.
 */
export async function retakeSegment(
  id: string,
  input: { text?: string; settings?: RenderSettings; voiceProfileId?: string | null },
) {
  try {
    const refused = await refuseImported(id);
    if (refused) return refused;
    const text = input.text !== undefined ? segmentTextSchema.parse(input.text) : undefined;
    const settings = input.settings ? renderSettingsSchema.parse(input.settings) : undefined;

    const result = await renderGeneration(id, {
      overrides: {
        text,
        ...(settings && { modelId: settings.modelId, params: settings.params }),
        ...(input.voiceProfileId !== undefined && { voiceProfileId: input.voiceProfileId || null }),
      },
    });
    if (result.success && settings && result.data?.episodeId) {
      await prisma.episode.update({
        where: { id: result.data.episodeId },
        data: { modelId: settings.modelId, params: settings.params },
      });
    }
    return result;
  } catch (error) {
    return fail(error);
  }
}

/**
 * Change the voice of a segment that has no audio yet; it goes back to the
 * queue. A finished segment changes voice through `retakeSegment`, so its
 * voice never disagrees with its audio.
 */
export async function setSegmentVoice(id: string, voiceProfileId: string | null) {
  try {
    const row = await prisma.generation.findUnique({ where: { id } });
    if (!row) return { success: false as const, error: 'المقطع مش موجود' };
    if (row.source !== 'tts') return (await refuseImported(id))!;
    if (row.status === 'COMPLETED') {
      return { success: false as const, error: 'المقطع ده متولّد بالفعل — غيّر صوته بإعادة التوليد' };
    }
    const reference = await resolveVoiceReference(voiceProfileId, row.modelId);
    if (!reference.ok) return { success: false as const, error: reference.error };

    const updated = await prisma.generation.update({
      where: { id },
      data: { voiceProfileId: voiceProfileId || null, status: 'PENDING', error: null },
    });
    return { success: true as const, data: updated };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Give every segment of an episode one voice, and make it the episode's.
 *
 * Segments without audio switch here and go back to the queue. Finished ones
 * with a different voice are only reported (`toRender`): re-voicing them means
 * rendering them again, which the page does through its queue after asking.
 */
export async function applyVoiceToSegments(episodeId: string, voiceProfileId: string | null) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { segments: { orderBy: SEGMENT_ORDER } },
    });
    if (!episode) return { success: false as const, error: 'الحلقة مش موجودة' };

    const voice = voiceProfileId || null;
    const modelId = episode.modelId ?? episode.segments[0]?.modelId;
    if (modelId) {
      const reference = await resolveVoiceReference(voice, modelId);
      if (!reference.ok) return { success: false as const, error: reference.error };
    }

    // Uploads, recordings and library clips have no voice to change.
    const differing = episode.segments.filter((s) => s.source === 'tts' && s.voiceProfileId !== voice);
    const queued = differing.filter((s) => s.status !== 'COMPLETED').map((s) => s.id);
    const toRender = differing.filter((s) => s.status === 'COMPLETED').map((s) => s.id);

    await prisma.$transaction([
      prisma.generation.updateMany({
        where: { id: { in: queued } },
        data: { voiceProfileId: voice, status: 'PENDING', error: null },
      }),
      prisma.episode.update({ where: { id: episodeId }, data: { voiceProfileId: voice } }),
    ]);
    return { success: true as const, data: { queued: queued.length, toRender } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Give the selected segments one voice. Like `applyVoiceToSegments`, but for a
 * selection, and without changing the episode's own voice: unrendered ones
 * switch here and go back to the queue; rendered ones are returned
 * (`toRender`) for the page to re-render through its queue. Audio the user
 * added (uploads, recordings, library clips) has no voice and is skipped.
 */
export async function setVoiceForSegments(episodeId: string, ids: string[], voiceProfileId: string | null) {
  try {
    const segments = await prisma.generation.findMany({
      where: { episodeId, id: { in: ids }, source: 'tts' },
      orderBy: SEGMENT_ORDER,
    });
    const voice = voiceProfileId || null;
    for (const modelId of Array.from(new Set(segments.map((s) => s.modelId)))) {
      const reference = await resolveVoiceReference(voice, modelId);
      if (!reference.ok) return { success: false as const, error: reference.error };
    }

    const differing = segments.filter((s) => s.voiceProfileId !== voice);
    const queued = differing.filter((s) => s.status !== 'COMPLETED').map((s) => s.id);
    const toRender = differing.filter((s) => s.status === 'COMPLETED').map((s) => s.id);
    await prisma.generation.updateMany({
      where: { id: { in: queued } },
      data: { voiceProfileId: voice, status: 'PENDING', error: null },
    });
    return { success: true as const, data: { queued: queued.length, toRender } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Edit a segment that has no audio yet. A finished segment is edited through
 * `retakeSegment` instead, so its text never disagrees with its audio. An
 * imported segment's text is only its label, so it can be renamed any time.
 */
export async function updateSegmentText(id: string, text: string) {
  try {
    const value = segmentTextSchema.parse(text);
    const row = await prisma.generation.findUnique({ where: { id } });
    if (!row) return { success: false as const, error: 'المقطع مش موجود' };
    if (row.source !== 'tts') {
      const renamed = await prisma.generation.update({ where: { id }, data: { text: value } });
      return { success: true as const, data: renamed };
    }
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

/**
 * Put an episode's segments in the given order (drag and drop). `ids` must be
 * exactly the episode's segments; anything else means the page was looking at
 * a stale list, and is refused rather than half-applied.
 */
export async function reorderSegments(episodeId: string, ids: string[]) {
  try {
    const current = await prisma.generation.findMany({ where: { episodeId }, select: { id: true } });
    const known = new Set(current.map((s) => s.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
      return { success: false as const, error: 'قايمة المقاطع اتغيّرت — حدّث الصفحة وجرّب تاني' };
    }
    await prisma.$transaction(
      ids.map((id, position) => prisma.generation.update({ where: { id }, data: { position } })),
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
 * Delete the selected segments of one episode and their files. Scoped to the
 * episode, so a stale or foreign id deletes nothing. Rows go first: if that
 * fails, no audio has been removed.
 */
export async function deleteSegments(episodeId: string, ids: string[]) {
  try {
    const rows = await prisma.generation.findMany({
      where: { episodeId, id: { in: ids } },
      select: { id: true, audioPath: true },
    });
    const { count } = await prisma.generation.deleteMany({ where: { episodeId, id: { in: rows.map((r) => r.id) } } });
    for (const row of rows) await deleteStoredAudio(row.audioPath);
    return { success: true as const, data: { deleted: count } };
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
        // Rebuilt from the segments: any hand edits to the old merge are gone.
        mergedEditedAt: null,
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
