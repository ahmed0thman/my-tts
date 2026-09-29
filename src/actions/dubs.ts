'use server';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { assembleDub as assembleOnEngine, transcribeVideo } from '@/lib/tts-client';
import { renderGeneration, resolveVoiceReference } from '@/lib/render';
import { deleteStoredAudio, STORAGE_ROOT } from '@/lib/storage';
import { mergeSignature } from '@/lib/projects';
import { lineTiming } from '@/lib/dubbing';
import {
  dubAssembleSchema,
  dubTitleSchema,
  renderSettingsSchema,
  segmentTextSchema,
  type RenderSettings,
} from '@/lib/validations';

/**
 * A dub is a video with a new voice. Its speech is transcribed into timed
 * lines (Generation rows with `dubId`); each line is rendered to fit the
 * seconds the original took, and the takes replace the video's audio.
 *
 * The video itself arrives through the Route Handler `POST /api/dubs` (a
 * video is far past the Server Action body limit).
 */

const LINE_ORDER = [{ position: 'asc' as const }, { createdAt: 'asc' as const }];

function fail(error: any, fallback = 'حصل خطأ غير متوقع') {
  return { success: false as const, error: error?.errors?.[0]?.message || error?.message || fallback };
}

export async function getDubs() {
  try {
    const dubs = await prisma.dub.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { lines: { select: { status: true } } },
    });
    return {
      success: true as const,
      data: dubs.map(({ lines, ...dub }) => ({
        ...dub,
        lineCount: lines.length,
        doneCount: lines.filter((l) => l.status === 'COMPLETED').length,
      })),
    };
  } catch (error) {
    return fail(error);
  }
}

export async function getDub(id: string) {
  try {
    const dub = await prisma.dub.findUnique({
      where: { id },
      include: { lines: { orderBy: LINE_ORDER, include: { voiceProfile: true } } },
    });
    if (!dub) return { success: false as const, error: 'الدبلجة مش موجودة' };
    const outputIsCurrent = !!dub.outputVideoPath && dub.outputSignature === outputSignature(dub);
    return { success: true as const, data: { ...dub, outputIsCurrent } };
  } catch (error) {
    return fail(error);
  }
}

/** Which takes, and how loud the original under them, the dubbed video was built from. */
function outputSignature(dub: { background: number; lines: { id: string; audioPath: string | null }[] }) {
  return `${dub.background}|${mergeSignature(dub.lines)}`;
}

export async function renameDub(id: string, title: string) {
  try {
    const dub = await prisma.dub.update({ where: { id }, data: { title: dubTitleSchema.parse(title) } });
    revalidatePath('/dubbing');
    return { success: true as const, data: dub };
  } catch (error) {
    return fail(error);
  }
}

/** Deletes the dub, its lines, and every file it made in storage/. An exported copy is left alone. */
export async function deleteDub(id: string) {
  try {
    const dub = await prisma.dub.findUnique({
      where: { id },
      include: { lines: { select: { audioPath: true } } },
    });
    if (!dub) return { success: false as const, error: 'الدبلجة مش موجودة' };

    await prisma.dub.delete({ where: { id } });
    await Promise.all(
      [...dub.lines.map((l) => l.audioPath), dub.videoPath, dub.posterPath, dub.outputVideoPath, dub.outputAudioPath].map(
        (p) => deleteStoredAudio(p),
      ),
    );
    revalidatePath('/dubbing');
    return { success: true as const };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Start a new dub from a video another dub already has — the same video in
 * another voice or language. The file is copied (a clone on APFS, so it costs
 * no space), so deleting either dub never breaks the other.
 */
export async function createDubFromExisting(sourceId: string, title: string) {
  try {
    const source = await prisma.dub.findUnique({ where: { id: sourceId } });
    if (!source) return { success: false as const, error: 'الفيديو مش موجود' };

    const copy = async (stored: string | null, prefix: string) => {
      if (!stored) return null;
      const from = path.resolve(STORAGE_ROOT, stored.replace(/^\/?storage\//, ''));
      if (!from.startsWith(STORAGE_ROOT + path.sep)) throw new Error('مسار الملف مش صحيح');
      const name = `${prefix}_${randomUUID()}${path.extname(from)}`;
      await fs.copyFile(from, path.join(STORAGE_ROOT, 'videos', name), fs.constants.COPYFILE_FICLONE);
      return `/storage/videos/${name}`;
    };

    const dub = await prisma.dub.create({
      data: {
        title: dubTitleSchema.parse(title),
        videoPath: (await copy(source.videoPath, 'src'))!,
        videoName: source.videoName,
        posterPath: await copy(source.posterPath, 'src'),
        duration: source.duration,
        width: source.width,
        height: source.height,
        hasAudio: source.hasAudio,
        modelId: source.modelId,
        voiceProfileId: source.voiceProfileId,
        params: source.params ?? undefined,
        outputDir: source.outputDir,
      },
    });
    revalidatePath('/dubbing');
    return { success: true as const, data: dub };
  } catch (error) {
    return fail(error);
  }
}

/** Remember the voice a dub renders with. */
async function rememberSettings(dubId: string, settings: RenderSettings) {
  await prisma.dub.update({
    where: { id: dubId },
    data: {
      modelId: settings.modelId,
      params: settings.params,
      voiceProfileId: settings.voiceProfileId || null,
    },
  });
}

/**
 * Transcribe the video into timed lines, replacing any lines (and takes) it
 * had. Every line starts queued with its own words as the text to speak —
 * re-voicing in the same language needs nothing more; for another language
 * the user pastes a translation over them (`applyTranslation`).
 */
export async function transcribeDub(id: string, input: { language?: string; settings: RenderSettings }) {
  try {
    const settings = renderSettingsSchema.parse(input.settings);
    const dub = await prisma.dub.findUnique({ where: { id }, include: { lines: { select: { audioPath: true } } } });
    if (!dub) return { success: false as const, error: 'الدبلجة مش موجودة' };
    if (!dub.hasAudio) return { success: false as const, error: 'الفيديو ده مفيهوش صوت نفرّغه' };

    const language = input.language && input.language !== 'auto' ? input.language : undefined;
    const result = await transcribeVideo(dub.videoPath, language);
    if (result.lines.length === 0) {
      return { success: false as const, error: 'مسمعناش كلام في الفيديو ده' };
    }

    const voiceProfileId = settings.voiceProfileId || null;
    await prisma.$transaction([
      prisma.generation.deleteMany({ where: { dubId: id } }),
      ...result.lines.map((line, position) =>
        prisma.generation.create({
          data: {
            dubId: id,
            position,
            text: line.text,
            sourceText: line.text,
            startMs: Math.round(line.start * 1000),
            endMs: Math.round(line.end * 1000),
            modelId: settings.modelId,
            params: settings.params,
            voiceProfileId,
            status: 'PENDING',
          },
        }),
      ),
      prisma.dub.update({
        where: { id },
        data: {
          language: result.language,
          transcribedAt: new Date(),
          modelId: settings.modelId,
          params: settings.params,
          voiceProfileId,
        },
      }),
    ]);
    for (const line of dub.lines) await deleteStoredAudio(line.audioPath);

    revalidatePath('/dubbing');
    return { success: true as const, data: { language: result.language, lines: result.lines.length } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Set the text of a line. A line whose text changes goes back to the queue
 * and loses its take — a take that says something other than its line is
 * worse than none, and the assembly refuses unfinished lines.
 */
async function setLineTexts(dubId: string, updates: { id: string; text: string }[]) {
  const lines = await prisma.generation.findMany({ where: { dubId, id: { in: updates.map((u) => u.id) } } });
  const byId = new Map(lines.map((l) => [l.id, l]));
  const changed = updates.filter((u) => byId.has(u.id) && byId.get(u.id)!.text !== u.text);

  await prisma.$transaction(
    changed.map((u) =>
      prisma.generation.update({
        where: { id: u.id },
        data: {
          text: u.text,
          status: 'PENDING',
          error: null,
          audioPath: null,
          savedPath: null,
          duration: null,
          fileSize: null,
          editedAt: null,
        },
      }),
    ),
  );
  for (const u of changed) await deleteStoredAudio(byId.get(u.id)!.audioPath);
  return changed.length;
}

/** The user's translation, one text per line in order. The count must match exactly. */
export async function applyTranslation(dubId: string, texts: string[]) {
  try {
    const parsed = texts.map((t) => segmentTextSchema.parse(t));
    const lines = await prisma.generation.findMany({ where: { dubId }, orderBy: LINE_ORDER, select: { id: true } });
    if (lines.length !== parsed.length) {
      return {
        success: false as const,
        error: `الترجمة فيها ${parsed.length} سطر، والفيديو ${lines.length} سطر — لازم يتساووا`,
      };
    }
    const changed = await setLineTexts(
      dubId,
      lines.map((line, index) => ({ id: line.id, text: parsed[index] })),
    );
    return { success: true as const, data: { changed } };
  } catch (error) {
    return fail(error);
  }
}

/** Put the original words back on every line (undo a translation). */
export async function restoreSourceText(dubId: string) {
  try {
    const lines = await prisma.generation.findMany({ where: { dubId }, orderBy: LINE_ORDER });
    const changed = await setLineTexts(
      dubId,
      lines.filter((l) => l.sourceText).map((l) => ({ id: l.id, text: l.sourceText! })),
    );
    return { success: true as const, data: { changed } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateLineText(id: string, text: string) {
  try {
    const row = await prisma.generation.findUnique({ where: { id }, select: { dubId: true } });
    if (!row?.dubId) return { success: false as const, error: 'السطر مش موجود' };
    await setLineTexts(row.dubId, [{ id, text: segmentTextSchema.parse(text) }]);
    return { success: true as const };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Render one line, fitted to its place in the video: the engine aims the
 * take at the line's own seconds and never past the room before the next
 * line (see `_fit_durations` in voicetut_engine.py).
 *
 * `settings` (the page's model, knobs and voice) apply to this take and
 * become the dub's; a failed retake keeps the old take.
 */
export async function renderDubLine(id: string, input: { settings?: RenderSettings; text?: string } = {}) {
  try {
    const row = await prisma.generation.findUnique({ where: { id } });
    if (!row?.dubId) return { success: false as const, error: 'السطر مش موجود' };
    const dub = await prisma.dub.findUnique({ where: { id: row.dubId }, select: { duration: true } });
    const next = await prisma.generation.findFirst({
      where: { dubId: row.dubId, startMs: { gt: row.startMs ?? -1 } },
      orderBy: { startMs: 'asc' },
      select: { startMs: true },
    });
    const timing = lineTiming(row, next?.startMs ?? null, dub?.duration ?? 0);

    const settings = input.settings ? renderSettingsSchema.parse(input.settings) : undefined;
    const text = input.text !== undefined ? segmentTextSchema.parse(input.text) : undefined;
    const result = await renderGeneration(id, {
      overrides: {
        text,
        ...(settings && {
          modelId: settings.modelId,
          params: settings.params,
          voiceProfileId: settings.voiceProfileId || null,
        }),
      },
      engineParams: timing ? { targetDuration: timing.slot, maxDuration: timing.room } : undefined,
    });
    if (result.success && settings) await rememberSettings(row.dubId, settings);
    return result;
  } catch (error) {
    return fail(error);
  }
}

/** Check the page's voice before queueing a whole dub on it. */
export async function checkDubVoice(settings: RenderSettings) {
  try {
    const parsed = renderSettingsSchema.parse(settings);
    const reference = await resolveVoiceReference(parsed.voiceProfileId || null, parsed.modelId);
    return reference.ok ? { success: true as const } : { success: false as const, error: reference.error };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Build the dubbed video: every take at its line's start, on a track exactly
 * as long as the video, replacing its audio. Refuses while a line is
 * unfinished — a dub with a silent sentence is worse than one not ready yet.
 */
export async function assembleDub(id: string, input: { background: number; outputDir?: string }) {
  try {
    const { background, outputDir } = dubAssembleSchema.parse(input);
    const dub = await prisma.dub.findUnique({ where: { id }, include: { lines: { orderBy: LINE_ORDER } } });
    if (!dub) return { success: false as const, error: 'الدبلجة مش موجودة' };
    if (dub.lines.length === 0) return { success: false as const, error: 'لسه مفيش أسطر — فرّغ الفيديو الأول' };

    const unfinished = dub.lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.status !== 'COMPLETED' || !line.audioPath);
    if (unfinished.length > 0) {
      const numbers = unfinished.slice(0, 8).map(({ number }) => number).join('، ');
      return {
        success: false as const,
        error: `لسه فيه ${unfinished.length} سطر مش جاهز (رقم ${numbers}${unfinished.length > 8 ? '…' : ''}). ولّدهم الأول.`,
      };
    }

    const result = await assembleOnEngine({
      videoPath: dub.videoPath,
      clips: dub.lines.map((line) => ({ path: line.audioPath!, start: (line.startMs ?? 0) / 1000 })),
      background,
      outputDir: outputDir || undefined,
      filenameHint: dub.title,
    });

    const updated = await prisma.dub.update({
      where: { id },
      data: {
        background,
        outputDir: outputDir || null,
        outputVideoPath: result.video_path,
        outputAudioPath: result.audio_path,
        outputSavedPath: result.saved_path,
        outputAt: new Date(),
        outputSignature: outputSignature({ background, lines: dub.lines }),
      },
    });
    for (const old of [dub.outputVideoPath, dub.outputAudioPath]) {
      if (old && old !== result.video_path && old !== result.audio_path) await deleteStoredAudio(old);
    }

    revalidatePath('/dubbing');
    return { success: true as const, data: { dub: updated, spedUp: result.sped_up, trimmed: result.trimmed } };
  } catch (error) {
    return fail(error);
  }
}
