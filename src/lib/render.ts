import type { Generation, VoiceProfile } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateSpeech, listModels } from '@/lib/tts-client';
import { deleteStoredAudio } from '@/lib/storage';

/**
 * Rendering a Generation row, shared by the studio (`createGeneration`) and by
 * projects (`renderSegment`, `retakeSegment`). Server-only.
 */

/**
 * The chosen model's cloning contract: whether it needs the transcription as
 * well as the clip, and how long a clip it can actually use.
 *
 * Both come from the engine's own `describe()` rather than being restated
 * here, so re-registering a model with a different cap needs no change in the
 * frontend.
 */
async function modelCloningContract(
  modelId: string,
): Promise<{ requiresReferenceText: boolean; maxReferenceSeconds: number | null }> {
  try {
    const { models } = await listModels();
    const model = models.find((m) => m.id === modelId);
    return {
      requiresReferenceText: model?.requiresReferenceText ?? false,
      maxReferenceSeconds: model?.maxReferenceSeconds ?? null,
    };
  } catch {
    // If the engine is unreachable the generate call will fail anyway; do not
    // block on this lookup.
    return { requiresReferenceText: false, maxReferenceSeconds: null };
  }
}

export type VoiceReference =
  | { ok: true; referenceAudioPath?: string; referenceText?: string }
  | { ok: false; error: string };

/**
 * Look up the voice profile's reference clip and its transcription, and refuse
 * early — with the number that is wrong — when the selected model cannot use
 * it. The engine refuses too, but only after the request has travelled.
 */
export async function resolveVoiceReference(
  voiceProfileId: string | null | undefined,
  modelId: string,
): Promise<VoiceReference> {
  if (!voiceProfileId) return { ok: true };

  const profile = await prisma.voiceProfile.findUnique({ where: { id: voiceProfileId } });
  if (!profile?.referenceAudioPath) return { ok: true };

  const { requiresReferenceText, maxReferenceSeconds } = await modelCloningContract(modelId);
  if (requiresReferenceText && !profile.referenceText?.trim()) {
    return {
      ok: false,
      error: `الصوت "${profile.name}" ناقصه نص العينة، والنموذج المختار محتاجه. افتحه من صفحة الأصوات واكتب اللي اتقال في التسجيل.`,
    };
  }
  if (maxReferenceSeconds !== null && profile.duration !== null && profile.duration > maxReferenceSeconds) {
    return {
      ok: false,
      error: `الصوت "${profile.name}" طوله ${profile.duration.toFixed(1)} ثانية، والنموذج بيشتغل صح لحد ${maxReferenceSeconds} ثواني. العيّنة الأطول بتخلّي النموذج يعيد كلام العيّنة نفسها وميقراش أول النص — سجّل عيّنة أقصر من صفحة الأصوات.`,
    };
  }

  return {
    ok: true,
    referenceAudioPath: profile.referenceAudioPath,
    referenceText: profile.referenceText || undefined,
  };
}

/** What a retake may change about a row. Unset fields keep the row's own value. */
export interface RenderOverrides {
  text?: string;
  modelId?: string;
  params?: Record<string, number>;
  /** `null` clears the profile (the model's own voice). */
  voiceProfileId?: string | null;
}

/**
 * Render an existing row — with the settings stored on it, or with
 * `overrides` for a retake.
 *
 * A row that already has audio (a retake) keeps it if the new render fails —
 * losing a good take to a failed retry would be worse than no retry — and in
 * that case the overrides are not written either, so the row's text and
 * settings still describe the audio it holds. On success the previous file is
 * deleted, since nothing else references it.
 */
export interface RenderResult {
  success: boolean;
  data?: Generation & { voiceProfile: VoiceProfile | null };
  error?: string;
}

export async function renderGeneration(
  id: string,
  options: { outputDir?: string; overrides?: RenderOverrides } = {},
): Promise<RenderResult> {
  const row = await prisma.generation.findUnique({ where: { id } });
  if (!row) return { success: false, error: 'المقطع مش موجود' };

  const { overrides = {} } = options;
  const settings = {
    text: overrides.text ?? row.text,
    modelId: overrides.modelId ?? row.modelId,
    params: overrides.params ?? ((row.params as Record<string, number>) ?? {}),
    voiceProfileId: overrides.voiceProfileId !== undefined ? overrides.voiceProfileId : row.voiceProfileId,
  };
  const previous = row.status === 'COMPLETED' && row.audioPath ? row : null;

  const reference = await resolveVoiceReference(settings.voiceProfileId, settings.modelId);
  if (!reference.ok) {
    if (!previous) {
      await prisma.generation.update({
        where: { id },
        data: { ...settings, status: 'FAILED', error: reference.error },
      });
    }
    return { success: false, error: reference.error };
  }

  // A row without audio takes the new settings straight away, so a failure
  // leaves the edited text in place to retry. A retake of a finished row
  // writes them only once the new audio exists.
  await prisma.generation.update({
    where: { id },
    data: previous ? { status: 'PROCESSING', error: null } : { ...settings, status: 'PROCESSING', error: null },
  });

  try {
    const result = await generateSpeech({
      text: settings.text,
      modelId: settings.modelId,
      voiceProfilePath: reference.referenceAudioPath,
      referenceText: reference.referenceText,
      params: settings.params,
      outputDir: options.outputDir,
    });

    const updated = await prisma.generation.update({
      where: { id },
      data: {
        ...settings,
        status: 'COMPLETED',
        audioPath: result.audio_path,
        savedPath: result.saved_path || null,
        seed: result.seed || null,
        duration: result.duration,
        fileSize: result.file_size,
        error: null,
      },
      include: { voiceProfile: true },
    });

    if (previous && previous.audioPath !== result.audio_path) {
      await deleteStoredAudio(previous.audioPath);
    }
    return { success: true, data: updated };
  } catch (error: any) {
    const message = error?.message || 'Unknown error occurred during generation';
    const failed = await prisma.generation.update({
      where: { id },
      data: previous ? { status: 'COMPLETED', error: null } : { status: 'FAILED', error: message },
      include: { voiceProfile: true },
    });
    return { success: false, data: failed, error: message };
  }
}
