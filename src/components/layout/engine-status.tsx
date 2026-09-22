'use client';

import { useEngineStatus } from '@/hooks/use-engine-status';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export function EngineStatus() {
  const { data, isLoading } = useEngineStatus();

  const isOnline = data?.isOnline ?? false;

  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              {isOnline && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              )}
              <span
                className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  isOnline ? 'bg-success' : 'bg-destructive',
                )}
              />
            </span>
          )}
          <span className="truncate text-xs font-bold">
            {isLoading ? 'جاري التحقق' : isOnline ? 'النموذج متصل' : 'النموذج مش متصل'}
          </span>
        </div>

        {isOnline && data?.device && (
          <span className="numeric shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {data.device}
          </span>
        )}
      </div>
    </div>
  );
}
