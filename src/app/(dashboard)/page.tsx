'use client';

import React, { useState } from 'react';
import { StudioTelemetry } from '@/components/studio/studio-telemetry';
import { GenerationForm } from '@/components/generation/generation-form';
import { useGenerations } from '@/hooks/use-generations';
import { Badge } from '@/components/ui/badge';
import { AudioPlayer } from '@/components/generation/audio-player';
import { History } from 'lucide-react';
import { formatDate, normalizeStatus, STATUS_LABELS } from '@/lib/utils';

export default function DashboardPage() {
  const [activeMode, setActiveMode] = useState<'single' | 'batch' | 'dialogue'>('single');
  const { data } = useGenerations({ page: 1, pageSize: 4 });
  const recentGenerations = data?.items || [];

  return (
    <div className="space-y-8">
      {/* Title sits alongside the engine readout rather than as a centred
          hero — this is a working console, not a landing page. */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">
              استوديو أحمد لتوليد الصوت العربي
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              نطق طبيعي بالعامية المصرية بدقة 24kHz، مع تحكم كامل في المشاعر وسرعة الإلقاء.
            </p>
          </div>
          <Badge variant="outline" className="numeric shrink-0">
            v1.0 AI Engine
          </Badge>
        </div>

        <StudioTelemetry activeMode={activeMode} onModeChange={setActiveMode} />
      </header>

      <GenerationForm mode={activeMode === 'batch' ? 'batch' : 'single'} />

      {recentGenerations.length > 0 && (
        <section className="space-y-4 border-t border-border pt-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold tracking-tight">آخر التسجيلات</h2>
            </div>
            <span className="numeric text-xs text-muted-foreground">
              {recentGenerations.length}
            </span>
          </div>

          <div className="grid gap-3">
            {recentGenerations.map((gen: any, i: number) => {
              const s = normalizeStatus(gen.status);
              return (
                <article
                  key={gen.id}
                  className="animate-rise flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-border-strong md:flex-row md:items-center"
                  style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
                >
                  <div className="min-w-0 flex-1 space-y-2" dir="rtl">
                    <p className="line-clamp-2 text-sm leading-relaxed">{gen.text}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        {gen.voiceProfile?.name || 'الصوت الافتراضي'}
                      </Badge>
                      <Badge
                        variant={
                          s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'destructive' : 'secondary'
                        }
                      >
                        {STATUS_LABELS[s]}
                      </Badge>
                      <span className="bidi-isolate text-[11px] text-muted-foreground">
                        {formatDate(gen.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full shrink-0 md:w-96">
                    {s === 'COMPLETED' && gen.audioPath && (
                      <AudioPlayer src={`/api/audio/${gen.audioPath}`} compact />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
