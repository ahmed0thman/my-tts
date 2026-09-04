import { z } from 'zod';

export const generateSchema = z.object({
  text: z.string().min(1, 'النص مطلوب').max(5000, 'النص يجب ألا يتجاوز 5000 حرف'),
  modelId: z.string().min(1),
  // Each model declares its own knobs via GET /api/models, so the ranges are
  // enforced by the engine rather than duplicated here.
  params: z.record(z.string(), z.coerce.number()).default({}),
  voiceProfileId: z.string().optional(),
  outputDir: z.string().optional(),
});

export type GenerateFormValues = z.infer<typeof generateSchema>;

export const voiceProfileSchema = z.object({
  name: z.string().min(1, 'الاسم مطلوب').max(100, 'الاسم يجب ألا يتجاوز 100 حرف'),
  description: z.string().optional(),
  // SILMA clones from the clip *and* its transcription; the NAMAA models use
  // audio alone. Stored either way, enforced per-model at generation time.
  referenceText: z.string().max(1000, 'نص العينة يجب ألا يتجاوز 1000 حرف').optional(),
});

export type VoiceProfileFormValues = z.infer<typeof voiceProfileSchema>;

export const presetSchema = z.object({
  name: z.string().min(1, 'الاسم مطلوب').max(100, 'الاسم يجب ألا يتجاوز 100 حرف'),
  description: z.string().optional(),
  modelId: z.string().min(1),
  params: z.record(z.string(), z.coerce.number()).default({}),
  voiceProfileId: z.string().optional(),
});

export type PresetFormValues = z.infer<typeof presetSchema>;
