'use client';

import { AlertTriangle, Clapperboard, FolderCheck, Loader2 } from 'lucide-react';
import { OutputPathPicker } from '@/components/generation/output-path-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/utils';
import type { DubDetail } from '@/hooks/use-dubs';

interface DubOutputPanelProps {
  dub: DubDetail;
  /** How loud the original soundtrack stays under the new voice, 0–1. */
  background: number;
  onBackgroundChange: (value: number) => void;
  /** Lines whose take is longer than their place, even sped up (they get cut). */
  overCount: number;
  isBusy: boolean;
  isAssembling: boolean;
  onAssemble: () => void;
  restoreSaved: boolean;
}

/**
 * The last step: lay every take at its line's time and replace the video's
 * audio. The track is exactly as long as the video.
 */
export function DubOutputPanel({
  dub,
  background,
  onBackgroundChange,
  overCount,
  isBusy,
  isAssembling,
  onAssemble,
  restoreSaved,
}: DubOutputPanelProps) {
  const lines = dub.lines;
  const ready = lines.filter((l) => l.status === 'COMPLETED' && l.audioPath).length;
  const allReady = lines.length > 0 && ready === lines.length;
  const hasOutput = !!dub.outputVideoPath;
  const percent = Math.round(background * 100);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-plate md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-1 text-primary">
            <Clapperboard className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold tracking-tight">تركيب الصوت على الفيديو</h3>
        </div>
        <Badge variant={allReady ? 'success' : 'secondary'}>
          <span className="numeric">
            {ready}/{lines.length}
          </span>
          جاهز
        </Badge>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold">صوت الفيديو الأصلي في الخلفية</span>
          <span className="numeric font-semibold text-muted-foreground">{percent === 0 ? 'مشال' : `${percent}%`}</span>
        </div>
        <Slider
          min={0}
          max={40}
          step={5}
          value={[percent]}
          onValueChange={([value]) => onBackgroundChange(value / 100)}
          dir="rtl"
          aria-label="صوت الفيديو الأصلي في الخلفية"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          صفر = الصوت الأصلي بيتشال خالص. لو فيه موسيقى تحب تفضل، ارفعه شوية — بس الكلام الأصلي هيبان تحته.
        </p>
      </div>

      <TooltipProvider delayDuration={200}>
        <OutputPathPicker restoreSaved={restoreSaved} label="مجلد التصدير" />
      </TooltipProvider>

      <div className="space-y-2">
        <Button className="w-full" disabled={!allReady || isBusy || isAssembling} onClick={onAssemble}>
          {isAssembling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
          {hasOutput ? 'ركّب من جديد' : 'ركّب الصوت على الفيديو'}
        </Button>
        {!allReady && lines.length > 0 && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            التركيب بيستنى كل الأسطر تخلص — فيديو ناقصه جملة أسوأ من فيديو لسه مش جاهز.
          </p>
        )}
        {overCount > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="numeric font-bold">{overCount}</span> سطر أطول من مكانه حتى بعد التسريع، وآخره هيتقص.
              قصّر نصه وولّده تاني.
            </span>
          </p>
        )}
      </div>

      {hasOutput && (
        <div className="space-y-3 border-t border-border pt-4">
          {!dub.outputIsCurrent && (
            <p className="flex items-start gap-1.5 rounded-lg bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              الأسطر أو صوت الخلفية اتغيّروا بعد آخر تركيب — ركّب تاني عشان الفيديو يطابقهم.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            آخر تركيب <span className="bidi-isolate">{dub.outputAt ? formatDate(dub.outputAt) : ''}</span> — شغّله من
            «المدبلج» فوق.
          </p>
          {dub.outputSavedPath && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <FolderCheck className="h-3.5 w-3.5 shrink-0 text-success" />
              <span
                dir="ltr"
                className="flex-1 truncate text-left font-mono text-[11px] text-muted-foreground"
                title={dub.outputSavedPath}
              >
                {dub.outputSavedPath}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
