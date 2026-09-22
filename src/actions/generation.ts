'use server';

import { prisma } from '@/lib/prisma';
import { generateSpeech, listModels } from '@/lib/tts-client';
import { generateSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_MODEL_ID } from '@/lib/models';

/** Whether the chosen model clones from clip + transcription, or audio alone. */
async function modelRequiresReferenceText(modelId: string): Promise<boolean> {
  try {
    const { models } = await listModels();
    return models.find((m) => m.id === modelId)?.requiresReferenceText ?? false;
  } catch {
    // If the engine is unreachable the generate call will fail anyway; do not
    // block on this lookup.
    return false;
  }
}

interface CreateGenerationInput {
  text: string;
  /** Engine to render with; defaults to silma. */
  modelId?: string;
  /** Model-specific knobs, keyed by that model's `params` schema. */
  params?: Record<string, number>;
  voiceProfileId?: string;
  /** Absolute folder to export the WAV to. Empty means the default storage/audio. */
  outputDir?: string;
}

/**
 * Create a new TTS generation.
 * Accepts either FormData or a plain object for flexibility.
 */
export async function createGeneration(input: FormData | CreateGenerationInput) {
  try {
    // Parse input - handle both FormData and plain objects
    let rawData: CreateGenerationInput;
    if (input instanceof FormData) {
      rawData = {
        text: input.get('text') as string,
        voiceProfileId: (input.get('voiceProfileId') as string) || undefined,
        modelId: (input.get('modelId') as string) || DEFAULT_MODEL_ID,
        params: input.get('params') ? JSON.parse(input.get('params') as string) : {},
        outputDir: (input.get('outputDir') as string) || undefined,
      };
    } else {
      rawData = {
        ...input,
        modelId: input.modelId ?? DEFAULT_MODEL_ID,
        params: input.params ?? {},
      };
    }

    const validatedData = generateSchema.parse(rawData);

    // Look up the voice profile's reference clip and its transcription. Only
    // models that declare requiresReferenceText need the text; the engine
    // rejects the call if it is missing, so we surface a clear message first.
    let referenceAudioPath: string | undefined;
    let referenceText: string | undefined;
    if (validatedData.voiceProfileId) {
      const profile = await prisma.voiceProfile.findUnique({
        where: { id: validatedData.voiceProfileId },
      });
      if (profile?.referenceAudioPath) {
        const needsText = await modelRequiresReferenceText(validatedData.modelId);
        if (needsText && !profile.referenceText?.trim()) {
          return {
            success: false,
            error: `الصوت "${profile.name}" ناقصه نص العينة، والنموذج المختار محتاجه. افتحه من صفحة الأصوات واكتب اللي اتقال في التسجيل.`,
          };
        }
        referenceAudioPath = profile.referenceAudioPath;
        referenceText = profile.referenceText || undefined;
      }
    }

    // Create the generation record as PENDING
    const generation = await prisma.generation.create({
      data: {
        text: validatedData.text,
        voiceProfileId: validatedData.voiceProfileId || null,
        modelId: validatedData.modelId,
        params: validatedData.params,
        status: 'PENDING',
      },
    });

    try {
      // Update to PROCESSING
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'PROCESSING' },
      });

      // Call the TTS engine
      const result = await generateSpeech({
        text: validatedData.text,
        modelId: validatedData.modelId,
        voiceProfilePath: referenceAudioPath,
        referenceText,
        params: validatedData.params,
        outputDir: validatedData.outputDir,
      });

      // Update to COMPLETED with the audio metadata
      const updatedGeneration = await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: 'COMPLETED',
          audioPath: result.audio_path,
          savedPath: result.saved_path || null,
          seed: result.seed || null,
          duration: result.duration,
          fileSize: result.file_size,
        },
        include: { voiceProfile: true },
      });

      revalidatePath('/');
      return { success: true, data: updatedGeneration };
    } catch (error: any) {
      // Update to FAILED
      const failedGeneration = await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error occurred during generation',
        },
        include: { voiceProfile: true },
      });
      revalidatePath('/');
      return { success: false, data: failedGeneration, error: error.message };
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Validation failed' };
  }
}

export async function getGenerations(params: { page?: number; pageSize?: number; voiceProfileId?: string; status?: string } = {}) {
  try {
    const { page = 1, pageSize = 10, voiceProfileId, status } = params;

    const where: any = {};
    if (voiceProfileId) where.voiceProfileId = voiceProfileId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.generation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          voiceProfile: true,
        },
      }),
      prisma.generation.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getGeneration(id: string) {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id },
      include: {
        voiceProfile: true,
      },
    });

    if (!generation) {
      return { success: false, error: 'Generation not found' };
    }

    return { success: true, data: generation };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteGeneration(id: string) {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id },
    });

    if (!generation) {
      return { success: false, error: 'Generation not found' };
    }

    // Try to delete the audio file from disk
    if (generation.audioPath) {
      try {
        const audioDir = path.resolve(process.cwd(), 'storage');
        const fullPath = path.join(audioDir, generation.audioPath.replace(/^\/storage\//, ''));
        await fs.unlink(fullPath);
      } catch (e) {
        console.warn(`Could not delete audio file: ${generation.audioPath}`, e);
      }
    }

    await prisma.generation.delete({
      where: { id },
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function retryGeneration(id: string) {
  try {
    const original = await prisma.generation.findUnique({
      where: { id },
    });

    if (!original) {
      return { success: false, error: 'Original generation not found' };
    }

    return await createGeneration({
      text: original.text,
      voiceProfileId: original.voiceProfileId || undefined,
      modelId: original.modelId,
      params: (original.params as Record<string, number>) ?? {},
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getGenerationStats() {
  try {
    const [total, completed, failed, aggregations] = await Promise.all([
      prisma.generation.count(),
      prisma.generation.count({ where: { status: 'COMPLETED' } }),
      prisma.generation.count({ where: { status: 'FAILED' } }),
      prisma.generation.aggregate({
        where: { status: 'COMPLETED' },
        _sum: {
          duration: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        total,
        completed,
        failed,
        totalDuration: aggregations._sum.duration || 0,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
