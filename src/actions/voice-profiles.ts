'use server';

import { prisma } from '@/lib/prisma';
import { uploadReference, deleteVoice } from '@/lib/tts-client';
import { voiceProfileSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export async function createVoiceProfile(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const referenceText = formData.get('referenceText') as string;

    if (!file || !name) {
      return { success: false, error: 'File and name are required' };
    }

    if (!referenceText?.trim()) {
      return { success: false, error: 'نص العينة مطلوب — اكتب بالظبط اللي اتقال في التسجيل' };
    }

    const uploadResult = await uploadReference(file);

    const profile = await prisma.voiceProfile.create({
      data: {
        name,
        description,
        referenceAudioPath: uploadResult.path,
        referenceText: referenceText.trim(),
        duration: uploadResult.duration,
      },
    });

    revalidatePath('/');
    return { success: true, data: profile };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getVoiceProfiles() {
  try {
    const profiles = await prisma.voiceProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { generations: true }
        }
      }
    });

    return { success: true, data: profiles };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getVoiceProfile(id: string) {
  try {
    const profile = await prisma.voiceProfile.findUnique({
      where: { id },
      include: {
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!profile) {
      return { success: false, error: 'Voice profile not found' };
    }

    return { success: true, data: profile };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateVoiceProfile(id: string, formData: FormData) {
  try {
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const referenceText = formData.get('referenceText') as string | null;

    const profile = await prisma.voiceProfile.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(referenceText !== null && { referenceText: referenceText.trim() }),
      },
    });

    revalidatePath('/');
    return { success: true, data: profile };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteVoiceProfile(id: string) {
  try {
    const profile = await prisma.voiceProfile.findUnique({
      where: { id }
    });

    if (!profile) {
      return { success: false, error: 'Voice profile not found' };
    }

    if (profile.referenceAudioPath) {
      // The engine deletes by filename; referenceAudioPath is a full disk path
      const filename = profile.referenceAudioPath.split('/').pop();
      if (filename) {
        try {
          await deleteVoice(filename);
        } catch (e) {
          console.warn(`Could not delete reference audio: ${filename}`, e);
        }
      }
    }

    await prisma.voiceProfile.delete({
      where: { id }
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function setDefaultVoiceProfile(id: string) {
  try {
    await prisma.$transaction([
      prisma.voiceProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      prisma.voiceProfile.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
