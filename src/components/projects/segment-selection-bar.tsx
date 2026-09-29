'use client';

import { CheckSquare, Mic, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EpisodeSegment } from '@/hooks/use-episodes';
import { SegmentVoiceDialog } from './segment-voice-dialog';

/**
 * What to do with the segments selected in the grid. Regenerate and voice
 * apply to the ones a model made; audio the user added (uploads, recordings,
 * library clips) has no voice and nothing to render, so the counts say how
 * many each action will touch.
 */

interface SegmentSelectionBarProps {
  selected: EpisodeSegment[];
  total: number;
  /** Anything rendering — render-type actions wait. */
  isBusy: boolean;
  /** Some of the selection is rendering right now — it cannot be deleted. */
  touchesRendering: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onRegenerate: () => void;
  onVoice: (voiceProfileId: string | null) => void;
  onDelete: () => void;
}

export function SegmentSelectionBar({
  selected,
  total,
  isBusy,
  touchesRendering,
  onSelectAll,
  onClear,
  onRegenerate,
  onVoice,
  onDelete,
}: SegmentSelectionBarProps) {
  const generated = selected.filter((s) => s.source === 'tts');
  const voices = new Set(generated.map((s) => s.voiceProfileId ?? null));
  const commonVoice = voices.size === 1 ? Array.from(voices)[0] : undefined;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/40 bg-primary/8 px-3 py-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onClear} title="إلغاء التحديد" aria-label="إلغاء التحديد">
          <X className="h-4 w-4" />
        </Button>
        <span className="text-sm font-bold">
          <span className="numeric">{selected.length}</span> محدد
        </span>
        {selected.length < total && (
          <Button variant="ghost" size="sm" onClick={onSelectAll}>
            <CheckSquare className="h-3.5 w-3.5" />
            حدد الكل
            <Count value={total} />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={isBusy || generated.length === 0}
          onClick={onRegenerate}
          title="كل مقطع بصوته، وبإعدادات النموذج اللي في الحلقة"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          إعادة التوليد
          {generated.length !== selected.length && <Count value={generated.length} />}
        </Button>
        <SegmentVoiceDialog
          title={`صوت ${generated.length} مقطع`}
          modelId={generated[0]?.modelId ?? ''}
          voiceProfileId={commonVoice}
          hasAudio={generated.some((s) => s.status === 'COMPLETED')}
          disabled={isBusy || generated.length === 0}
          onConfirm={onVoice}
        >
          <Button variant="outline" size="sm" disabled={isBusy || generated.length === 0}>
            <Mic className="h-3.5 w-3.5" />
            تغيير الصوت
            {generated.length !== selected.length && <Count value={generated.length} />}
          </Button>
        </SegmentVoiceDialog>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={touchesRendering}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          مسح المحدد
        </Button>
      </div>
    </div>
  );
}

/** How many a button acts on — a chip rather than "(3)", whose brackets flip around a number in RTL. */
function Count({ value }: { value: number }) {
  return <span className="numeric rounded-md bg-foreground/10 px-1.5 text-[11px] leading-5">{value}</span>;
}
