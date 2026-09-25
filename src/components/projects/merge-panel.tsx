'use client';

import { AlertTriangle, Combine, FolderCheck, Loader2 } from 'lucide-react';
import { AudioPlayer } from '@/components/generation/audio-player';
import { OutputPathPicker } from '@/components/generation/output-path-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, formatDuration } from '@/lib/utils';
import type { EpisodeDetail } from '@/hooks/use-episodes';

/** Pauses between segments. Sentence-level segments want ~a breath; paragraphs a little more. */
const GAP_OPTIONS = [
  { value: 0, label: 'من غير فاصل' },
  { value: 200, label: 'قصير جداً — 0.2 ث' },
  { value: 350, label: 'نَفَس — 0.35 ث' },
  { value: 500, label: 'متوسط — 0.5 ث' },
  { value: 800, label: 'وقفة — 0.8 ث' },
  { value: 1200, label: 'وقفة طويلة — 1.2 ث' },
];

interface MergePanelProps {
  episode: EpisodeDetail;
  gapMs: number;
  onGapChange: (gapMs: number) => void;
  isBusy: boolean;
  isMerging: boolean;
  onMerge: () => void;
  /** Keep the picker's saved-folder memory aligned with the voice panel's. The picker binds `outputDir` in the surrounding settings form. */
  restoreSaved: boolean;
}

export function MergePanel({ episode, gapMs, onGapChange, isBusy, isMerging, onMerge, restoreSaved }: MergePanelProps) {
  const segments = episode.segments;
  const ready = segments.filter((s) => s.status === 'COMPLETED' && s.audioPath).length;
  const allReady = segments.length > 0 && ready === segments.length;
  const renderedSeconds = segments.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const expectedSeconds = renderedSeconds + (Math.max(segments.length - 1, 0) * gapMs) / 1000;

  const hasMerge = !!episode.mergedAudioPath;
  const isStale = hasMerge && !episode.mergeIsCurrent;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-plate md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-1 text-primary">
            <Combine className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold tracking-tight">دمج المقاطع</h3>
        </div>
        <Badge variant={allReady ? 'success' : 'secondary'}>
          <span className="numeric">
            {ready}/{segments.length}
          </span>
          جاهز
        </Badge>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold">الفاصل بين المقاطع</span>
        <Select value={String(gapMs)} onValueChange={(value) => onGapChange(Number(value))}>
          <SelectTrigger dir="rtl" className="h-10 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {GAP_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
            {!GAP_OPTIONS.some((o) => o.value === gapMs) && (
              <SelectItem value={String(gapMs)} className="text-xs">
                {gapMs} ms
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* The picker's help icon is a Radix tooltip; VoiceControls provides one for itself, this panel has to as well. */}
      <TooltipProvider delayDuration={200}>
        <OutputPathPicker restoreSaved={restoreSaved} label="مجلد التصدير" />
      </TooltipProvider>

      <div className="space-y-2">
        <Button className="w-full" disabled={!allReady || isBusy || isMerging} onClick={onMerge}>
          {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Combine className="h-4 w-4" />}
          {hasMerge ? 'ادمج من جديد' : 'ادمج المقاطع'}
          {allReady && (
            <span className="numeric text-xs opacity-80">({formatDuration(expectedSeconds)})</span>
          )}
        </Button>
        {!allReady && segments.length > 0 && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            الدمج بيستنى كل المقاطع تخلص. صوت ناقصه جملة أسوأ من صوت لسه مش جاهز.
          </p>
        )}
      </div>

      {hasMerge && (
        <div className="space-y-3 border-t border-border pt-4">
          {isStale && (
            <p className="flex items-start gap-1.5 rounded-lg bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              المقاطع اتغيّرت بعد آخر دمج — ادمج تاني عشان الملف النهائي يطابقها.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              آخر دمج <span className="bidi-isolate">{episode.mergedAt ? formatDate(episode.mergedAt) : ''}</span>
            </span>
            {episode.mergedDuration != null && (
              <span className="numeric font-semibold text-foreground">{formatDuration(episode.mergedDuration)}</span>
            )}
          </div>
          <AudioPlayer src={`/api/audio/${episode.mergedAudioPath}`} compact />
          {episode.mergedSavedPath && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <FolderCheck className="h-3.5 w-3.5 shrink-0 text-success" />
              <span
                dir="ltr"
                className="flex-1 truncate text-left font-mono text-[11px] text-muted-foreground"
                title={episode.mergedSavedPath}
              >
                {episode.mergedSavedPath}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
