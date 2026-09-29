'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, AudioWaveform, Loader2, Pencil, Play, RotateCcw } from 'lucide-react';
import { AudioPlayer } from '@/components/generation/audio-player';
import { ClampedText } from '@/components/generation/clamped-text';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/providers/confirm-provider';
import { cn, normalizeStatus, STATUS_LABELS } from '@/lib/utils';
import { fitState, formatTimestamp } from '@/lib/dubbing';
import type { DubLine } from '@/hooks/use-dubs';

interface DubLineCardProps {
  line: DubLine;
  number: number;
  /** Seconds this line has: its own slot, and the room before the next line starts. */
  timing: { slot: number; room: number } | null;
  isRendering: boolean;
  isBusy: boolean;
  /** Play the original video from this line's start. */
  onSeek: () => void;
  onRetake: () => void;
  /** Save new text; a line with a take loses it and goes back to the queue. */
  onSaveText: (text: string) => void;
}

const FIT = {
  fits: { label: 'على قد مكانه', variant: 'success' as const },
  tight: { label: 'هيتسرّع شوية', variant: 'accent' as const },
  over: { label: 'أطول من مكانه', variant: 'destructive' as const },
};

/**
 * One line of the video: when it is spoken, what was said, what the new
 * voice says, and its take — with how well the take fits its place.
 */
export function DubLineCard({ line, number, timing, isRendering, isBusy, onSeek, onRetake, onSaveText }: DubLineCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(line.text);
  const cardRef = useRef<HTMLElement | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (isRendering) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isRendering]);

  const status = normalizeStatus(line.status);
  const displayStatus = isRendering ? 'PROCESSING' : status === 'PROCESSING' ? 'PENDING' : status;
  const hasAudio = status === 'COMPLETED' && !!line.audioPath;
  const translated = !!line.sourceText && line.sourceText !== line.text;
  const fit = hasAudio && line.duration != null && timing ? fitState(line.duration, timing.room) : null;

  const retake = async () => {
    if (
      line.editedAt &&
      !(await confirm({
        title: 'تمسح تعديلات المحرر؟',
        description: 'السطر ده متعدّل في محرر الصوت، وإعادة توليده هتمسح التعديلات دي.',
        confirmLabel: 'أعد التوليد',
        destructive: true,
      }))
    )
      return;
    onRetake();
  };

  return (
    <article
      ref={cardRef}
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-card transition-colors',
        isRendering ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border hover:border-border-strong',
        displayStatus === 'FAILED' && 'border-destructive/40',
      )}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3">
        <span
          className={cn(
            'numeric grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-xs font-bold',
            hasAudio ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {number}
        </span>
        <button
          type="button"
          onClick={onSeek}
          title="شغّل الفيديو الأصلي من هنا"
          dir="ltr"
          className="numeric inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Play className="h-3 w-3" />
          {formatTimestamp(line.startMs ?? 0)} → {formatTimestamp(line.endMs ?? 0)}
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          {displayStatus !== 'COMPLETED' && (
            <Badge
              variant={displayStatus === 'FAILED' ? 'destructive' : displayStatus === 'PROCESSING' ? 'accent' : 'secondary'}
            >
              {displayStatus === 'PROCESSING' && <Loader2 className="animate-spin" />}
              {STATUS_LABELS[displayStatus]}
            </Badge>
          )}
          {fit && (
            <Badge
              variant={FIT[fit].variant}
              title={`التسجيل ${line.duration!.toFixed(1)} ث، ومكانه ${timing!.slot.toFixed(1)} ث (والمساحة لحد السطر اللي بعده ${timing!.room.toFixed(1)} ث)`}
            >
              <span className="numeric">
                {line.duration!.toFixed(1)}/{timing!.slot.toFixed(1)}ث
              </span>
              {FIT[fit].label}
            </Badge>
          )}
          {hasAudio && line.editedAt && <Badge variant="accent">متعدّل</Badge>}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3 pt-2.5">
        <ClampedText text={line.text} lines={3} />
        {translated && (
          <p className="line-clamp-2 border-s-2 border-border ps-2 text-xs leading-relaxed text-muted-foreground" dir="auto">
            {line.sourceText}
          </p>
        )}

        {fit === 'over' && (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            النص أطول من الوقت المتاح له، وآخره هيتقص في الفيديو — قصّره شوية وولّده تاني.
          </p>
        )}
        {displayStatus === 'FAILED' && line.error && (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-3 min-w-0 break-words" title={line.error}>
              {line.error}
            </span>
          </p>
        )}

        <div className="mt-auto">
          {hasAudio ? (
            <AudioPlayer src={`/api/audio/${line.audioPath}`} compact />
          ) : displayStatus === 'PROCESSING' ? (
            <div className="flex h-[4.75rem] items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              بيتولّد دلوقتي...
            </div>
          ) : (
            <div className="flex h-[4.75rem] items-center justify-center rounded-2xl border border-dashed border-border-strong text-xs text-muted-foreground">
              {displayStatus === 'FAILED' ? 'مفيش صوت — جرّب تاني' : 'مستني دوره'}
            </div>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-1 border-t border-border px-2.5 py-2">
        <Button
          variant={hasAudio ? 'ghost' : 'outline'}
          size="sm"
          onClick={() => void retake()}
          disabled={isBusy}
          title="بيتولّد بالصوت والإعدادات اللي على اليمين، على قد مكانه في الفيديو"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {hasAudio ? 'إعادة التوليد' : 'ولّده دلوقتي'}
        </Button>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setDraft(line.text);
              setIsEditing(true);
            }}
            disabled={isRendering}
            title="تعديل النص"
            aria-label="تعديل النص"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {hasAudio && (
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className={cn(isRendering && 'pointer-events-none opacity-45')}
              title="تعديل الصوت في المحرر"
            >
              <Link href={`/editor?segment=${line.id}`} aria-label="تعديل الصوت">
                <AudioWaveform className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </footer>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader>
            <DialogTitle>تعديل السطر رقم {number}</DialogTitle>
            <DialogDescription>
              {timing && (
                <>
                  مكانه في الفيديو <span className="numeric">{timing.slot.toFixed(1)}</span> ثانية. خلّي النص على قد
                  الوقت ده عشان يتقال بسرعة طبيعية.{' '}
                </>
              )}
              {hasAudio && 'التسجيل الحالي هيتمسح والسطر يرجع يستنى دوره.'}
            </DialogDescription>
          </DialogHeader>
          {line.sourceText && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground" dir="auto">
              {line.sourceText}
            </p>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            dir="auto"
            className="text-base leading-relaxed"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                const text = draft.trim();
                if (!text) return;
                setIsEditing(false);
                if (text !== line.text) onSaveText(text);
              }}
              disabled={!draft.trim()}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
