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

export const projectSchema = z.object({
  title: z.string().trim().min(1, 'اسم المشروع مطلوب').max(120, 'الاسم يجب ألا يتجاوز 120 حرف'),
  description: z.string().trim().max(2000, 'الوصف يجب ألا يتجاوز 2000 حرف').optional(),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;

export const episodeSchema = z.object({
  title: z.string().trim().min(1, 'الاسم مطلوب').max(120, 'الاسم يجب ألا يتجاوز 120 حرف'),
  description: z.string().trim().max(2000, 'الوصف يجب ألا يتجاوز 2000 حرف').optional(),
  kind: z.enum(['episode', 'short', 'other']).default('episode'),
});

export type EpisodeFormValues = z.infer<typeof episodeSchema>;

/** The voice a project renders with — the same fields as the studio form, minus the text. */
export const renderSettingsSchema = z.object({
  modelId: z.string().min(1),
  params: z.record(z.string(), z.coerce.number()).default({}),
  voiceProfileId: z.string().optional(),
  outputDir: z.string().optional(),
});

export type RenderSettings = z.infer<typeof renderSettingsSchema>;

export const segmentTextSchema = z
  .string()
  .trim()
  .min(1, 'النص مطلوب')
  .max(5000, 'المقطع يجب ألا يتجاوز 5000 حرف');

export const addSegmentsSchema = z.object({
  texts: z.array(segmentTextSchema).min(1, 'مفيش ولا مقطع').max(500, 'أقصى عدد 500 مقطع في المرة'),
  settings: renderSettingsSchema,
});

export const mergeSchema = z.object({
  gapMs: z.coerce.number().int().min(0).max(5000),
  outputDir: z.string().optional(),
});
