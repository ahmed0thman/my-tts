'use server';

import { browseDirectories, createDirectory, validateDirectory } from '@/lib/tts-client';

/**
 * List the sub-directories of a path so the control board can pick a save location.
 * Path is resolved by the TTS engine, which owns the filesystem.
 */
export async function listDirectories(path?: string) {
  try {
    const data = await browseDirectories(path);
    return { success: true as const, data };
  } catch (error: any) {
    return { success: false as const, error: error.message || 'تعذر قراءة المجلد' };
  }
}

/**
 * Check whether a typed-in save folder exists and can be written to.
 */
export async function checkDirectory(path: string) {
  try {
    const data = await validateDirectory(path);
    return { success: true as const, data };
  } catch (error: any) {
    return { success: false as const, error: error.message || 'تعذر التحقق من المسار' };
  }
}

/**
 * Create a new folder inside the one the picker is showing.
 */
export async function makeDirectory(parent: string, name: string) {
  try {
    const data = await createDirectory(parent, name);
    return { success: true as const, data };
  } catch (error: any) {
    return { success: false as const, error: error.message || 'معرفناش نعمل المجلد' };
  }
}
