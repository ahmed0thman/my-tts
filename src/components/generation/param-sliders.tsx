'use client';

import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import type { TtsModel } from '@/lib/tts-client';

/**
 * One slider per parameter the model declares, driven by plain value/onChange.
 *
 * The schema comes from the engine (GET /api/models), so adding a model — or
 * changing its knobs — needs no change here. Kept presentational so both the
 * studio (react-hook-form) and the presets page (local state) can use it.
 */
export function ParamSliders({
  model,
  values,
  onChange,
}: {
  model?: TtsModel;
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  if (!model || model.params.length === 0) return null;

  return (
    <>
      {model.params.map((spec) => {
        const value = values[spec.key] ?? spec.default;
        const display = spec.integer ? String(value) : value.toFixed(spec.step < 0.1 ? 2 : 1);

        return (
          <div key={spec.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer text-xs font-bold">{spec.label}</Label>
              <Badge variant="outline" className="flex items-center gap-1 px-2 py-0.5 text-xs">
                <span className="numeric">{display}{spec.format ?? ''}</span>
              </Badge>
            </div>
            <Slider
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={[value]}
              onValueChange={(next) => onChange({ ...values, [spec.key]: next[0] })}
              className="cursor-pointer"
            />
            <div className="flex justify-between px-0.5 text-[10px] font-medium text-muted-foreground">
              <span className="numeric">{spec.min}</span>
              <span className="numeric">{spec.max}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
