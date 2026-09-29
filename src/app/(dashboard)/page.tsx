'use client';

import React, { useState } from 'react';
import { StudioTelemetry } from '@/components/studio/studio-telemetry';
import { GenerationForm } from '@/components/generation/generation-form';

export default function DashboardPage() {
  const [activeMode, setActiveMode] = useState<'single' | 'batch' | 'dialogue'>('single');

  // Title sits alongside the engine readout rather than as a centred hero —
  // this is a working console, not a landing page.
  const header = (
    <header className="grid gap-3 xl:grid-cols-[auto_1fr] xl:items-center xl:gap-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">صوتك — استوديو النطق المصري</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          اكتب نصك، واسمعه بصوتك إنت. عامية مصرية بدقة 24kHz، وكله بيشتغل على جهازك.
        </p>
      </div>
      <StudioTelemetry activeMode={activeMode} onModeChange={setActiveMode} />
    </header>
  );

  return <GenerationForm mode={activeMode === 'batch' ? 'batch' : 'single'} header={header} />;
}
