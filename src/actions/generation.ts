'use server';

import { prisma } from '@/lib/prisma';
import { generateSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { DEFAULT_MODEL_ID } from '@/lib/models';
import { renderGeneration, resolveVoiceReference, type RenderResult } from '@/lib/render';
import { deleteStoredAudio } from '@/lib/storage';

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
export async function createGeneration(input: FormData | CreateGenerationInput): Promise<RenderResult> {
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

    // Refuse a profile the model cannot use before a PENDING row exists.
    const reference = await resolveVoiceReference(validatedData.voiceProfileId, validatedData.modelId);
    if (!reference.ok) {
      return { success: false, error: reference.error };
    }

    const generation = await prisma.generation.create({
      data: {
        text: validatedData.text,
        voiceProfileId: validatedData.voiceProfileId || null,
        modelId: validatedData.modelId,
        params: validatedData.params,
        status: 'PENDING',
      },
    });

    const result = await renderGeneration(generation.id, { outputDir: validatedData.outputDir });
    revalidatePath('/');
    return result;
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
          episode: { select: { id: true, title: true, project: { select: { id: true, title: true } } } },
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

    // storage/ is resolved against the data root, not cwd — inside the
    // packaged app cwd is the bundle and holds no storage/.
    await deleteStoredAudio(generation.audioPath);

    await prisma.generation.delete({
      where: { id },
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function retryGeneration(id: string): Promise<RenderResult> {
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
