'use client';

import { useEngineProgress } from '@/hooks/use-progress';
import { Loader2, Download, AudioWaveform, AlertTriangle } from 'lucide-react';

/**
 * Live readout of what the engine is doing, polled once a second.
 *
 * Replaces a timer that cycled through four invented "stages" regardless of
 * what was happening. That was harmless when every model finished in seconds;
 * with Masri Higgs running ~7x slower than realtime it actively misled — the
 * bar would sit at "finished" for minutes with no way to tell work from a hang.
 */
export function GenerationProgress({ isPending }: { isPending: boolean }) {
  const { data, isError } = useEngineProgress(isPending);

  if (!isPending) return null;

  // The first poll can land before the engine has registered the job.
  const state = data?.state ?? 'loading';
  const elapsed = data?.elapsed ?? 0;

  const isLoading = state === 'loading';
  const hasChunks = (data?.chunks ?? 0) > 1;

  const headline = isLoading
    ? `تحميل النموذج${data?.model_id ? ` (${data.model_id})` : ''}...`
    : data?.detail || 'جاري التوليد...';

  // Loading has no measurable fraction, so it gets an indeterminate bar.
  const percent = isLoading ? null : data?.percent ?? null;

  return (
    <div className="space-y-2 border-t border-primary/20 bg-muted/60 p-3.5 text-xs">
      <div className="flex items-center justify-between gap-3 font-medium">
        <span className="flex min-w-0 items-center gap-1.5 text-primary">
          {isLoading ? (
            <Download className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          )}
          <span className="truncate" title={headline}>{headline}</span>
        </span>
        <span className="numeric shrink-0 text-[11px] text-muted-foreground">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        {percent === null ? (
          <div className="h-full w-1/3 animate-indeterminate rounded-full bg-primary" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {hasChunks && (
          <span>
            الجملة <span className="numeric">{Math.min((data?.chunk ?? 0) + 1, data!.chunks)}</span>
            {' / '}
            <span className="numeric">{data?.chunks}</span>
          </span>
        )}
        {(data?.audio_seconds ?? 0) > 0 && (
          <span className="flex items-center gap-1">
            <AudioWaveform className="h-3 w-3" />
            <span className="numeric">{data!.audio_seconds.toFixed(1)}</span> ثانية صوت
          </span>
        )}
        {isLoading && (
          <span>النموذج الكبير بياخد حوالي ٣ دقائق أول مرة</span>
        )}
        {isError && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            تعذّر قراءة الحالة — التوليد شغّال برضه
          </span>
        )}
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
