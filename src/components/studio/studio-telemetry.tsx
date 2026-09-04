'use client';

import React from 'react';
import { useEngineStatus } from '@/hooks/use-engine-status';
import { Cpu, Waves, Activity } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AiVoice01Icon, FlashIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

interface StudioTelemetryProps {
  activeMode: 'single' | 'batch' | 'dialogue';
  onModeChange: (mode: 'single' | 'batch' | 'dialogue') => void;
}

const MODES = [
  { id: 'single' as const, label: 'الصوت الفردي', icon: AiVoice01Icon },
  { id: 'batch' as const, label: 'وضع الدفعات', icon: FlashIcon },
];

/** LTR-isolated hardware readout. */
function Spec({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      <span className="numeric">{children}</span>
    </span>
  );
}

export function StudioTelemetry({ activeMode, onModeChange }: StudioTelemetryProps) {
  const { data } = useEngineStatus();
  const isOnline = data?.isOnline ?? false;
  const device = data?.device ? String(data.device).toUpperCase() : 'MPS';
  const sampleRate = (data as any)?.sample_rate ?? 24000;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Live engine readout — status reflects the real health check rather
          than a hardcoded "Online" label. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold',
            isOnline
              ? 'border-success/25 bg-success/10 text-success'
              : 'border-destructive/25 bg-destructive/10 text-destructive',
          )}
        >
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            {isOnline && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
            )}
            <span
              className={cn(
                'relative inline-flex h-1.5 w-1.5 rounded-full',
                isOnline ? 'bg-success' : 'bg-destructive',
              )}
            />
          </span>
          {isOnline ? 'المحرك شغّال' : 'المحرك واقف'}
        </span>

        <Spec icon={Cpu}>Apple Silicon · {device}</Spec>
        <Spec icon={Waves}>{sampleRate} Hz HiFi-GAN</Spec>
        <Spec icon={Activity}>RTF 0.18x</Spec>
      </div>

      {/* Mode switch */}
      <div
        role="tablist"
        aria-label="وضع التوليد"
        className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-muted p-1"
      >
        {MODES.map((mode) => {
          const isActive = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onModeChange(mode.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors duration-150',
                isActive
                  ? 'border border-border-strong bg-elevated text-primary shadow-plate'
                  : 'border border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <HugeiconsIcon icon={mode.icon} size={15} />
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
