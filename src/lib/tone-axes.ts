import type { TtsModel } from '@/lib/tts-client';

/**
 * Semantic dials shared by every model, mapped onto whatever knobs it declares.
 *
 * The persona chips and the recommended presets want to say "slower and more
 * measured" without knowing which engine is selected — but the two runtimes
 * expose unrelated parameters (`speed`/`cfgStrength`/`nfeStep` vs
 * `exaggeration`/`cfgWeight`/`temperature`). Hardcoding either set is what left
 * both of those features silently doing nothing after multi-model landed.
 *
 * So a tone is expressed on three normalized axes, and each *parameter key*
 * declares which axis it moves and in which direction. A model whose knobs map
 * to no axis simply keeps its defaults — nothing here is keyed on a model id,
 * so registering a fourth model still needs no change to this file.
 */
export type ToneAxis = 'pace' | 'expressiveness' | 'fidelity';

/** A point on each axis, 0 = low end, 1 = high end. Omitted axes stay at default. */
export type Tone = Partial<Record<ToneAxis, number>>;

interface AxisMapping {
  axis: ToneAxis;
  /**
   * +1 when a higher parameter value means more of the axis, -1 when it means
   * less. Chatterbox's `cfg_weight` is the inverted one: lowering it loosens
   * the delivery and speeds it up, which is why faster tones push it down.
   */
  direction: 1 | -1;
}

const PARAM_AXES: Record<string, AxisMapping> = {
  // SILMA (F5-TTS)
  speed: { axis: 'pace', direction: 1 },
  cfgStrength: { axis: 'fidelity', direction: 1 },
  nfeStep: { axis: 'fidelity', direction: 1 },
  // NAMAA (Chatterbox)
  cfgWeight: { axis: 'pace', direction: -1 },
  exaggeration: { axis: 'expressiveness', direction: 1 },
  temperature: { axis: 'expressiveness', direction: 1 },
  // VoiceTut (OmniVoice). `speed` above already covers its pacing knob —
  // the mapping is by parameter key, so it is shared with SILMA.
  guidanceScale: { axis: 'fidelity', direction: 1 },
  numStep: { axis: 'fidelity', direction: 1 },
};

/** Which axes the model can actually express, given the knobs it declares. */
export function axesOf(model?: TtsModel): Set<ToneAxis> {
  const axes = new Set<ToneAxis>();
  for (const spec of model?.params ?? []) {
    const mapping = PARAM_AXES[spec.key];
    if (mapping) axes.add(mapping.axis);
  }
  return axes;
}

/** True when the model can express at least one axis the tone actually sets. */
export function modelSupportsTone(model: TtsModel | undefined, tone: Tone): boolean {
  const axes = axesOf(model);
  return (Object.keys(tone) as ToneAxis[]).some((axis) => axes.has(axis));
}

/**
 * Turn a tone into concrete parameter values for one model.
 *
 * Every value is placed within the parameter's own declared range and snapped
 * to its own step, so the result is always something the engine accepts and the
 * slider can display without drifting off a tick.
 */
export function paramsForTone(model: TtsModel | undefined, tone: Tone): Record<string, number> {
  if (!model) return {};

  return Object.fromEntries(
    model.params.map((spec) => {
      const mapping = PARAM_AXES[spec.key];
      const level = mapping ? tone[mapping.axis] : undefined;
      if (level === undefined || !mapping) return [spec.key, spec.default];

      const t = mapping.direction === 1 ? level : 1 - level;
      return [spec.key, snapToSpec(interpolate(t, spec), spec)];
    }),
  );
}

/**
 * Interpolate around the parameter's own default rather than across its raw
 * range, so 0.5 always means "leave it neutral".
 *
 * A straight min→max ramp is wrong wherever the default is off-centre: SILMA's
 * `speed` defaults to 1.0 in a 0.5–2.0 range, so a midpoint tone would have
 * asked for 1.25 — a "neutral" preset that speeds the model up.
 */
function interpolate(t: number, spec: { min: number; max: number; default: number }): number {
  if (t <= 0.5) return spec.min + (t / 0.5) * (spec.default - spec.min);
  return spec.default + ((t - 0.5) / 0.5) * (spec.max - spec.default);
}

function snapToSpec(
  raw: number,
  spec: { min: number; max: number; step: number; integer?: boolean },
): number {
  const steps = Math.round((raw - spec.min) / spec.step);
  const snapped = spec.min + steps * spec.step;
  const clamped = Math.min(spec.max, Math.max(spec.min, snapped));
  // Float accumulation over a 0.05 step turns 1.35 into 1.3500000000000003,
  // which then fails an equality check against the slider's own value.
  return spec.integer ? Math.round(clamped) : Number(clamped.toFixed(4));
}
