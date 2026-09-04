'use client';

import { useFormContext } from 'react-hook-form';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Sliders } from 'lucide-react';
import type { TtsModel } from '@/lib/tts-client';

/**
 * Renders one slider per parameter the active model declares.
 *
 * The schema comes from the engine (GET /api/models), so adding a model — or
 * changing its knobs — needs no change here.
 */
export function ModelParams({ model }: { model?: TtsModel }) {
  const { setValue, watch } = useFormContext();
  const params: Record<string, number> = watch('params') || {};

  if (!model || model.params.length === 0) return null;

  return (
    <div className="space-y-5 border-t border-border/50 pt-4">
      <div className="flex items-center gap-2">
        <Sliders className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold">إعدادات {model.label}</span>
      </div>

      {model.params.map((spec) => {
        const value = params[spec.key] ?? spec.default;
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
              onValueChange={(next) =>
                setValue('params', { ...params, [spec.key]: next[0] }, { shouldDirty: true })
              }
              className="cursor-pointer"
            />
            <div className="flex justify-between px-0.5 text-[10px] font-medium text-muted-foreground">
              <span className="numeric">{spec.min}</span>
              <span className="numeric">{spec.max}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
