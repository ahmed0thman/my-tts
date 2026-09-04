'use client';

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useModels, defaultParamsFor } from '@/hooks/use-models';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormField, FormItem, FormControl } from '@/components/ui/form';
import { Cpu, Info, Loader2 } from 'lucide-react';
import type { TtsModel } from '@/lib/tts-client';

const STORAGE_KEY = 'namaa:model-id';

interface ModelSelectorProps {
  /** Fires when the active model changes, so siblings can react. */
  onModelChange?: (model: TtsModel | undefined) => void;
}

export function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const { control, setValue, watch } = useFormContext();
  const { data, isLoading } = useModels();

  const modelId: string = watch('modelId') || 'silma';
  const models = data?.models ?? [];
  const active = models.find((m) => m.id === modelId);

  // Restore the last used model across sessions
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setValue('modelId', saved, { shouldDirty: false });
    } catch {
      // localStorage can be unavailable; the default model still works
    }
  }, [setValue]);

  useEffect(() => {
    onModelChange?.(active);
  }, [active, onModelChange]);

  const handleChange = (nextId: string) => {
    const next = models.find((m) => m.id === nextId);
    setValue('modelId', nextId, { shouldDirty: true });
    // Parameter names do not transfer between models, so reset to the new
    // model's declared defaults rather than carrying stale keys across.
    setValue('params', defaultParamsFor(next), { shouldDirty: true });

    try {
      window.localStorage.setItem(STORAGE_KEY, nextId);
    } catch {
      // non-fatal
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-primary/10 p-1 text-primary">
          <Cpu className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold tracking-tight">نموذج النطق</h3>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <FormField
        control={control}
        name="modelId"
        render={({ field }) => (
          <FormItem>
            <Select onValueChange={handleChange} value={field.value || 'silma'}>
              <FormControl>
                <SelectTrigger dir="rtl" className="h-12 w-full border-border/80 bg-background/80 shadow-2xs">
                  <SelectValue placeholder="اختر النموذج" />
                </SelectTrigger>
              </FormControl>
              <SelectContent dir="rtl">
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="cursor-pointer">
                    <div className="flex items-center gap-2.5 text-right">
                      <div>
                        <p className="text-sm font-bold">{model.label}</p>
                        <p className="text-[11px] text-muted-foreground">{model.dialect}</p>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />

      {active && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{active.dialect}</Badge>
            {active.requiresReferenceText && (
              <Badge variant="outline" className="border-amber-300 bg-amber-500/10 text-[10px] text-amber-600 dark:border-amber-900 dark:text-amber-400">
                محتاج نص العينة
              </Badge>
            )}
            {active.maxReferenceSeconds && (
              <Badge variant="outline" className="text-[10px]">
                العينة ≤ {active.maxReferenceSeconds}s
              </Badge>
            )}
          </div>
          <p className="flex gap-1.5 text-[11px] leading-5 text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{active.notes}</span>
          </p>
          <p dir="ltr" className="truncate text-left font-mono text-[10px] text-muted-foreground/70" title={active.repo}>
            {active.repo}
          </p>
        </div>
      )}
    </div>
  );
}
