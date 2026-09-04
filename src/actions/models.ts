'use server';

import { listModels } from '@/lib/tts-client';

/**
 * Every model the engine can run, with its capabilities and parameter schema.
 * The control board renders its controls from this, so adding a model to
 * tts-engine/model_registry.py is enough to make it appear in the UI.
 */
export async function getModels() {
  try {
    const data = await listModels();
    return { success: true as const, data };
  } catch (error: any) {
    return { success: false as const, error: error.message || 'تعذر قراءة قائمة النماذج' };
  }
}
