'use client';

import { useFormContext } from 'react-hook-form';
import { Sliders } from 'lucide-react';
import { ParamSliders } from './param-sliders';
import type { TtsModel } from '@/lib/tts-client';

/** Binds the active model's declared parameters to the generation form. */
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

      <ParamSliders
        model={model}
        values={params}
        onChange={(next) => setValue('params', next, { shouldDirty: true })}
      />
    </div>
  );
}
