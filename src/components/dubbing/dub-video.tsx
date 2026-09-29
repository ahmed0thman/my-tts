'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DubVideoHandle {
  /** Show the original and play it from `seconds`. */
  playOriginalFrom: (seconds: number) => void;
}

/**
 * The video, original or dubbed. The line cards seek the original, so a line
 * can be checked against the picture it belongs to.
 */
export const DubVideo = forwardRef<
  DubVideoHandle,
  { videoPath: string; outputPath: string | null; posterPath: string | null }
>(function DubVideo({ videoPath, outputPath, posterPath }, ref) {
  const [mode, setMode] = useState<'original' | 'dubbed'>(outputPath ? 'dubbed' : 'original');
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const showing = mode === 'dubbed' && outputPath ? outputPath : videoPath;

  useImperativeHandle(ref, () => ({
    playOriginalFrom(seconds) {
      const video = videoRef.current;
      if (mode !== 'original') {
        // The source changes; seek once the original has loaded.
        pendingSeek.current = seconds;
        setMode('original');
        return;
      }
      if (!video) return;
      video.currentTime = seconds;
      void video.play().catch(() => {});
    },
  }));

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-plate">
      <video
        key={showing}
        ref={videoRef}
        src={`/api/audio/${showing}`}
        poster={posterPath ? `/api/audio/${posterPath}` : undefined}
        controls
        preload="metadata"
        className="aspect-video w-full bg-black"
        onLoadedMetadata={(e) => {
          if (pendingSeek.current === null) return;
          e.currentTarget.currentTime = pendingSeek.current;
          pendingSeek.current = null;
          void e.currentTarget.play().catch(() => {});
        }}
      />
      {outputPath && (
        <div className="grid grid-cols-2 gap-1 p-1.5" role="tablist" aria-label="أي نسخة">
          {(
            [
              ['dubbed', 'المدبلج'],
              ['original', 'الأصلي'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'rounded-lg py-1.5 text-xs font-bold transition-colors',
                mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
});
