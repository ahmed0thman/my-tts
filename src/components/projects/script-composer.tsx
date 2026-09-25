'use client';

import { useMemo, useState } from 'react';
import { Clock, ListPlus, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { estimateSeconds, splitScript, type SplitMode } from '@/lib/projects';
import { formatDuration } from '@/lib/utils';

const SPLIT_MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'line', label: 'كل سطر مقطع', hint: 'أدق في المراجعة — المقطع الغلط بيتعاد لوحده' },
  { id: 'paragraph', label: 'كل فقرة مقطع', hint: 'الفقرات بتتفصل بسطر فاضي؛ إلقاء أطول وأكثر ترابط' },
];

/** Past this many characters a segment is long enough that a retake gets expensive. */
const LONG_SEGMENT_CHARS = 600;

interface ScriptComposerProps {
  isBusy: boolean;
  isAdding: boolean;
  /** Queue the segments; `generate` also starts rendering them right away. */
  onAdd: (texts: string[], generate: boolean) => Promise<boolean>;
}

export function ScriptComposer({ isBusy, isAdding, onAdd }: ScriptComposerProps) {
  const [script, setScript] = useState('');
  const [mode, setMode] = useState<SplitMode>('line');

  const segments = useMemo(() => splitScript(script, mode), [script, mode]);
  const seconds = useMemo(() => segments.reduce((sum, s) => sum + estimateSeconds(s), 0), [segments]);
  const longest = segments.reduce((max, s) => Math.max(max, s.length), 0);

  const submit = async (generate: boolean) => {
    if (segments.length === 0) return;
    const added = await onAdd(segments, generate);
    if (added) setScript('');
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-plate focus-within:border-primary">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold">إضافة مقاطع من السكريبت</h2>
        <div
          role="radiogroup"
          aria-label="طريقة التقسيم"
          className="flex items-center gap-1 rounded-xl border border-border bg-muted p-1"
        >
          {SPLIT_MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={mode === option.id}
              title={option.hint}
              onClick={() => setMode(option.id)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                mode === option.id
                  ? 'border border-border-strong bg-elevated text-primary shadow-plate'
                  : 'border border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <Textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          dir="rtl"
          rows={8}
          placeholder={
            mode === 'line'
              ? 'الصق السكريبت هنا. كل سطر هيبقى مقطع لوحده بيتولّد ويتراجع لوحده، وبعدين المقاطع كلها بتندمج بالترتيب.'
              : 'الصق السكريبت هنا، وافصل بين الفقرات بسطر فاضي. كل فقرة هتبقى مقطع لوحدها.'
          }
          className="max-h-[50vh] min-h-40 resize-y border-0 p-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <span>
            <strong className="numeric text-foreground">{segments.length}</strong> مقطع
          </span>
          {segments.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
              <Clock className="h-3 w-3" />
              ~<span className="numeric">{formatDuration(seconds)}</span>
            </span>
          )}
          {longest > LONG_SEGMENT_CHARS && (
            <span className="font-semibold text-primary">فيه مقطع طويل — إعادته هتاخد وقت أطول</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={segments.length === 0 || isAdding}
            onClick={() => submit(false)}
            title="بيضيفهم للقايمة من غير توليد"
          >
            <ListPlus className="h-3.5 w-3.5" />
            إضافة للقايمة
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={segments.length === 0 || isAdding || isBusy}
            onClick={() => submit(true)}
          >
            {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {segments.length > 1 ? `إضافة وتوليد ${segments.length} مقاطع` : 'إضافة وتوليد'}
          </Button>
        </div>
      </div>
    </section>
  );
}
