'use server';

import { prisma } from '@/lib/prisma';
import { presetSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

interface CreatePresetInput {
  name: string;
  description?: string;
  modelId?: string;
  params?: Record<string, number>;
  voiceProfileId?: string;
}

export async function createPreset(input: FormData | CreatePresetInput) {
  try {
    let rawData: CreatePresetInput;
    if (input instanceof FormData) {
      rawData = {
        name: input.get('name') as string,
        description: (input.get('description') as string) || undefined,
        modelId: (input.get('modelId') as string) || 'silma',
        params: input.get('params') ? JSON.parse(input.get('params') as string) : {},
        voiceProfileId: (input.get('voiceProfileId') as string) || undefined,
      };
    } else {
      rawData = {
        ...input,
        modelId: input.modelId ?? 'silma',
        params: input.params ?? {},
      };
    }

    const validatedData = presetSchema.parse(rawData);

    const preset = await prisma.preset.create({
      data: validatedData,
    });

    revalidatePath('/');
    return { success: true, data: preset };
  } catch (error: any) {
    return { success: false, error: error.message || 'Validation failed' };
  }
}

export async function getPresets() {
  try {
    const presets = await prisma.preset.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: presets };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updatePreset(id: string, formData: FormData) {
  try {
    const rawData = {
      name: formData.get('name'),
      description: formData.get('description'),
      modelId: (formData.get('modelId') as string) || undefined,
      params: formData.get('params') ? JSON.parse(formData.get('params') as string) : undefined,
      voiceProfileId: formData.get('voiceProfileId') || undefined,
    };
    
    // Partial validation
    const data = Object.fromEntries(Object.entries(rawData).filter(([_, v]) => v !== undefined && v !== null && v !== ''));

    const preset = await prisma.preset.update({
      where: { id },
      data,
    });

    revalidatePath('/');
    return { success: true, data: preset };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deletePreset(id: string) {
  try {
    await prisma.preset.delete({
      where: { id },
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
