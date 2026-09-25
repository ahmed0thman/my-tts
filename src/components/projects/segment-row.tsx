'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { AudioPlayer } from '@/components/generation/audio-player';
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
import { cn, formatDuration, normalizeStatus, STATUS_LABELS } from '@/lib/utils';
import type { EpisodeSegment } from '@/hooks/use-episodes';

interface SegmentRowProps {
  segment: EpisodeSegment;
  number: number;
  isFirst: boolean;
  isLast: boolean;
  /** This row is the one the queue (or a retake) is rendering right now. */
  isRendering: boolean;
  /** Something is rendering somewhere — render-type actions wait their turn. */
  isBusy: boolean;
  onRetake: (text?: string) => void;
  onSaveText: (text: string) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}

export function SegmentRow({
  segment,
  number,
  isFirst,
  isLast,
  isRendering,
  isBusy,
  onRetake,
  onSaveText,
  onMove,
  onDelete,
}: SegmentRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);

  // A row left PROCESSING by an app that quit mid-render is not rendering;
  // only the one this page is working on shows as such.
  const status = normalizeStatus(segment.status);
  const displayStatus = isRendering ? 'PROCESSING' : status === 'PROCESSING' ? 'PENDING' : status;
  const hasAudio = status === 'COMPLETED' && !!segment.audioPath;

  const openEditor = () => {
    setDraft(segment.text);
    setIsEditing(true);
  };

  const submitEdit = () => {
    const text = draft.trim();
    if (!text) return;
    if (hasAudio) onRetake(text);
    else onSaveText(text);
    setIsEditing(false);
  };

  return (
    <article
      className={cn(
        'rounded-2xl border bg-card p-4 transition-colors',
        isRendering ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border',
        displayStatus === 'FAILED' && 'border-destructive/40',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'numeric grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold',
            hasAudio ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {number}
        </span>

        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{segment.text}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={
                displayStatus === 'COMPLETED'
                  ? 'success'
                  : displayStatus === 'FAILED'
                    ? 'destructive'
                    : displayStatus === 'PROCESSING'
                      ? 'accent'
                      : 'secondary'
              }
            >
              {displayStatus === 'PROCESSING' && <Loader2 className="animate-spin" />}
              {STATUS_LABELS[displayStatus]}
            </Badge>
            {hasAudio && segment.duration != null && (
              <Badge variant="outline">
                <span className="numeric">{formatDuration(segment.duration)}</span>
              </Badge>
            )}
            {segment.voiceProfile && <Badge variant="outline">{segment.voiceProfile.name}</Badge>}
          </div>

          {displayStatus === 'FAILED' && segment.error && (
            <p className="flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{segment.error}</span>
            </p>
          )}

          {hasAudio && <AudioPlayer src={`/api/audio/${segment.audioPath}`} compact />}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title="لفوق"
            aria-label="تحريك المقطع لفوق"
            disabled={isFirst}
            onClick={() => onMove('up')}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="لتحت"
            aria-label="تحريك المقطع لتحت"
            disabled={isLast}
            onClick={() => onMove('down')}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={openEditor} disabled={isRendering}>
          <Pencil className="h-3.5 w-3.5" />
          تعديل النص
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRetake()}
          disabled={isBusy}
          title="بيتولّد بإعدادات الصوت الحالية في المشروع"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {hasAudio ? 'إعادة التوليد' : 'ولّده دلوقتي'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hover:bg-destructive/10 hover:text-destructive"
          disabled={isRendering}
          onClick={() => {
            if (confirm(`تمسح المقطع رقم ${number}؟`)) onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          مسح
        </Button>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader>
            <DialogTitle>تعديل المقطع رقم {number}</DialogTitle>
            <DialogDescription>
              {hasAudio
                ? 'المقطع ده متولّد، فالحفظ هيعيد توليده بالنص الجديد. لو إعادة التوليد فشلت، التسجيل القديم بيفضل زي ما هو.'
                : 'المقطع لسه ماتولّدش، فالتعديل هيتحفظ وبس.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            dir="rtl"
            className="text-base leading-relaxed"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              إلغاء
            </Button>
            <Button onClick={submitEdit} disabled={!draft.trim() || (hasAudio && isBusy)}>
              {hasAudio ? 'حفظ وإعادة التوليد' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
