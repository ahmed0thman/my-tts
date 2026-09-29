'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { EnhanceOptions } from './audio-editor-frame';

/**
 * «تحسين احترافي»: the voice polish preset in one click, for someone who is
 * not an audio engineer. Every step is on by default and explained in plain
 * words; the switches are there for when one step does not suit a voice.
 * The chain itself lives in public/audio-editor/sawtak-voice.js.
 */

type StepKey = Exclude<keyof EnhanceOptions, 'preset' | 'gateThresholdDb' | 'removeBreaths'>;

const STEPS: { key: StepKey; title: string; hint: ReactNode }[] = [
  { key: 'denoise', title: 'إزالة الضوضاء', hint: 'الوشّ والهمهمة اللي في الخلفية' },
  { key: 'breaths', title: 'حذف النفَس والسكتات', hint: 'أي موجة قمتها أوطى من الحد بتتمسح تماماً — شوف الأرقام على يسار الموجة في المحرر' },
  { key: 'tone', title: 'طابع الصوت', hint: 'عمق ودفا تحت، أقل «زنّة»، ووضوح في الكلام' },
  { key: 'deess', title: 'تنعيم حروف السين والشين', hint: 'بيهدّي الصفير الحاد' },
  { key: 'compress', title: 'توازن العلو', hint: 'المقاطع الواطية تعلى والعالية تهدى' },
  {
    key: 'loudness',
    title: 'علو احترافي ثابت',
    hint: (
      <>
        <span dir="ltr">-19 LUFS</span>، المعيار للصوت المونو في البودكاست
      </>
    ),
  },
];

const PRESETS: { id: EnhanceOptions['preset']; title: string; hint: string }[] = [
  { id: 'deep', title: 'عميق ودافي', hint: 'بيس أكتر، إحساس راديو' },
  { id: 'clear', title: 'واضح ومتوازن', hint: 'حدّة أقل في البيس ووضوح أعلى' },
];

export const DEFAULT_ENHANCE: EnhanceOptions = {
  preset: 'deep',
  denoise: true,
  breaths: true,
  tone: true,
  deess: true,
  compress: true,
  loudness: true,
  gateThresholdDb: -40,
  removeBreaths: false,
};

interface EnhanceDialogProps {
  disabled?: boolean;
  isRunning: boolean;
  onApply: (options: EnhanceOptions) => void;
}

export function EnhanceDialog({ disabled, isRunning, onApply }: EnhanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<EnhanceOptions>(DEFAULT_ENHANCE);
  const anyStep = STEPS.some((step) => options[step.key]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || isRunning}>
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          تحسين احترافي
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تحسين احترافي للصوت</DialogTitle>
          <DialogDescription>
            نفس الخطوات اللي مهندس الصوت بيعملها للتعليق الصوتي، على الملف كله مرة واحدة. لو معجبكش، ارجع بـ
            Undo (<span dir="ltr">⌘Z</span>).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setOptions((o) => ({ ...o, preset: preset.id }))}
              disabled={!options.tone}
              className={cn(
                'cursor-pointer rounded-xl border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                options.preset === preset.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/40',
              )}
            >
              <p className="text-sm font-bold">{preset.title}</p>
              <p className="text-[11px] text-muted-foreground">{preset.hint}</p>
            </button>
          ))}
        </div>

        <ul className="space-y-1">
          {STEPS.map((step) => (
            <li key={step.key}>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{step.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{step.hint}</span>
                </span>
                <Switch
                  dir="ltr"
                  checked={options[step.key]}
                  onCheckedChange={(checked) => setOptions((o) => ({ ...o, [step.key]: checked }))}
                />
              </label>
              {step.key === 'breaths' && options.breaths && (
                <div className="flex items-center gap-3 px-2 pb-2 pt-1">
                  <span className="shrink-0 text-[11px] text-muted-foreground">الحد</span>
                  <Slider
                    dir="ltr"
                    min={-60}
                    max={-25}
                    step={1}
                    value={[options.gateThresholdDb]}
                    onValueChange={([value]) => setOptions((o) => ({ ...o, gateThresholdDb: value }))}
                    aria-label="حد الحذف"
                  />
                  <span dir="ltr" className="numeric w-14 shrink-0 text-end text-xs font-semibold">
                    {options.gateThresholdDb} dB
                  </span>
                </div>
              )}
              {step.key === 'breaths' && options.breaths && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">امسح النفَس حتى لو أعلى من الحد</span>
                    <span className="block text-[11px] text-muted-foreground">
                      ممكن ياخد معاه حروف زي الحاء والهاء — سيبه مقفول لو حروف بتتقطع
                    </span>
                  </span>
                  <Switch
                    dir="ltr"
                    checked={options.removeBreaths}
                    onCheckedChange={(checked) => setOptions((o) => ({ ...o, removeBreaths: checked }))}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOptions(DEFAULT_ENHANCE)}>
            الإعدادات الأصلية
          </Button>
          <Button
            disabled={!anyStep}
            onClick={() => {
              setOpen(false);
              onApply(options);
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            طبّق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
