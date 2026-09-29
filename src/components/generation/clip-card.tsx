'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AudioWaveform,
  CornerDownLeft,
  FolderCheck,
  Library,
  Loader2,
  Mic,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { AudioPlayer } from './audio-player';
import { ClampedText } from './clamped-text';
import { GenerationProgress } from './generation-progress';
import { SaveClipDialog } from '@/components/clips/save-clip-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate, formatDuration, normalizeStatus, STATUS_LABELS } from '@/lib/utils';

/**
 * One studio generation as a card in the studio's grid. The newest take is
 * marked and plays on its own, which is what the old listening dock did.
 */

interface ClipCardProps {
  generation: any;
  /** Just generated in this visit: marked, scrolled to and played. */
  isNew?: boolean;
  /** A generation is running, so an unfinished row may be the one rendering. */
  isGenerating?: boolean;
  onReuse: (text: string) => void;
  onRetry: () => void;
  onDelete: () => void;
}

export function ClipCard({ generation, isNew, isGenerating, onReuse, onRetry, onDelete }: ClipCardProps) {
  const ref = useRef<HTMLElement>(null);
  const status = normalizeStatus(generation.status);
  const hasAudio = status === 'COMPLETED' && !!generation.audioPath;
  // PENDING/PROCESSING with nothing running is a take an app quit left behind.
  const interrupted = (status === 'PENDING' || status === 'PROCESSING') && !isGenerating;

  useEffect(() => {
    if (isNew) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isNew]);

  return (
    <article
      ref={ref}
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-card transition-colors',
        isNew ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border hover:border-border-strong',
        status === 'FAILED' && 'border-destructive/40',
      )}
    >
      <header className="flex items-center gap-1.5 px-3.5 pt-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {isNew && <Badge variant="accent">جديد</Badge>}
          {status !== 'COMPLETED' && (
            <Badge variant={status === 'FAILED' ? 'destructive' : 'secondary'}>
              {interrupted ? 'ماكملش' : STATUS_LABELS[status]}
            </Badge>
          )}
          {hasAudio && generation.duration != null && (
            <Badge variant="outline">
              <span className="numeric">{formatDuration(generation.duration)}</span>
            </Badge>
          )}
          {hasAudio && generation.editedAt && <Badge variant="accent">متعدّل</Badge>}
        </div>
        <span className="bidi-isolate shrink-0 text-[11px] text-muted-foreground">{formatDate(generation.createdAt)}</span>
      </header>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3 pt-2.5">
        <ClampedText text={generation.text} />

        <div className="flex min-w-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Mic className="h-3 w-3 shrink-0" />
          <span className="truncate">{generation.voiceProfile?.name ?? 'الصوت الافتراضي'}</span>
        </div>

        {status === 'FAILED' && generation.error && (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-3 min-w-0 break-words" title={generation.error}>
              {generation.error}
            </span>
          </p>
        )}

        <div className="mt-auto space-y-2">
          {hasAudio ? (
            <AudioPlayer src={`/api/audio/${generation.audioPath}`} compact autoPlay={isNew} />
          ) : (
            <div className="flex h-[4.75rem] items-center justify-center rounded-2xl border border-dashed border-border-strong text-xs text-muted-foreground">
              مفيش صوت
            </div>
          )}
          {hasAudio && generation.savedPath && (
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground" title={generation.savedPath}>
              <FolderCheck className="h-3.5 w-3.5 shrink-0 text-success" />
              <span dir="ltr" className="truncate font-mono">
                {tail(generation.savedPath)}
              </span>
            </p>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-1 border-t border-border px-2.5 py-2">
        {status === 'FAILED' || interrupted ? (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isGenerating}>
            <RefreshCw className="h-3.5 w-3.5" />
            جرّب تاني
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReuse(generation.text)}
            title="حط النص ده في خانة الكتابة عشان تعدّله أو تولّده تاني"
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
            استخدم النص
          </Button>
        )}
        <div className="flex items-center">
          {hasAudio && (
            <SaveClipDialog generationId={generation.id} defaultName={generation.text}>
              <Button variant="ghost" size="icon-sm" title="احفظه في مكتبة المقاطع" aria-label="احفظه في المكتبة">
                <Library className="h-3.5 w-3.5" />
              </Button>
            </SaveClipDialog>
          )}
          {hasAudio && (
            <Button asChild variant="ghost" size="icon-sm" title="تعديل الصوت في المحرر">
              <Link href={`/editor?segment=${generation.id}`} aria-label="تعديل الصوت">
                <AudioWaveform className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-destructive/10 hover:text-destructive"
            title="مسح"
            aria-label="مسح التسجيل"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </footer>
    </article>
  );
}

/** The end of a path — the folder and file — which is the part worth reading in a card. */
function tail(path: string) {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path;
}

/** The take being generated right now, before it has a row in the list. */
export function PendingClipCard({ text, label }: { text: string; label?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  return (
    <article
      ref={ref}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-primary/60 bg-card ring-2 ring-primary/15"
    >
      <header className="flex items-center gap-1.5 px-3.5 pt-3">
        <Badge variant="accent">
          <Loader2 className="animate-spin" />
          {label ?? 'بيتولّد'}
        </Badge>
      </header>
      <div className="flex-1 px-3.5 pb-3 pt-2.5">
        <p dir="auto" className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      </div>
      <GenerationProgress isPending />
    </article>
  );
}
