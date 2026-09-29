'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  AudioWaveform,
  FileAudio,
  GripVertical,
  Library,
  Loader2,
  Mic,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SquarePlus,
  Trash2,
} from 'lucide-react';
import { AudioPlayer } from '@/components/generation/audio-player';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SaveClipDialog } from '@/components/clips/save-clip-dialog';
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
import { useConfirm } from '@/providers/confirm-provider';
import { SegmentVoiceDialog } from './segment-voice-dialog';
import { ClampedText } from '@/components/generation/clamped-text';

interface SegmentCardProps {
  segment: EpisodeSegment;
  number: number;
  /** This row is the one the queue (or a retake) is rendering right now. */
  isRendering: boolean;
  /** Something is rendering somewhere — render-type actions wait their turn. */
  isBusy: boolean;
  onRetake: (text?: string) => void;
  onSaveText: (text: string) => void;
  /** `null` is the model's own voice. A segment with audio is rendered again. */
  onChangeVoice: (voiceProfileId: string | null) => void;
  onDelete: () => void;
  /** Open «إضافة صوت» with the slot right after this segment. */
  onInsertAfter: () => void;
  /** In the grid's selection (for bulk regenerate / voice / delete). */
  isSelected: boolean;
  /** `range`: Shift was held — select everything from the last clicked card to this one. */
  onToggleSelect: (range: boolean) => void;
}

/** Audio the user brought in rather than a model rendered — see Generation.source. */
const IMPORTED = {
  upload: { label: 'ملف', icon: FileAudio },
  recording: { label: 'تسجيل بصوتك', icon: Mic },
  library: { label: 'من المكتبة', icon: Library },
} as const;

/**
 * One segment as a card in the episode's grid: its text, voice, take and
 * actions. Rendering scrolls it into view, so the queue can be followed.
 */
export function SegmentCard({
  segment,
  number,
  isRendering,
  isBusy,
  onRetake,
  onSaveText,
  onChangeVoice,
  onDelete,
  onInsertAfter,
  isSelected,
  onToggleSelect,
}: SegmentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const imported = segment.source in IMPORTED ? IMPORTED[segment.source as keyof typeof IMPORTED] : null;
  const confirm = useConfirm();
  const [draft, setDraft] = useState(segment.text);
  const cardRef = useRef<HTMLElement | null>(null);
  // The header is the drag handle, so the player's seek bar and the buttons
  // keep their own pointer gestures.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.id,
  });

  useEffect(() => {
    if (isRendering) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isRendering]);

  // A row left PROCESSING by an app that quit mid-render is not rendering;
  // only the one this page is working on shows as such.
  const status = normalizeStatus(segment.status);
  const displayStatus = isRendering ? 'PROCESSING' : status === 'PROCESSING' ? 'PENDING' : status;
  const hasAudio = status === 'COMPLETED' && !!segment.audioPath;

  const openEditor = () => {
    setDraft(segment.text);
    setIsEditing(true);
  };

  // A take changed in the audio editor is replaced wholesale by a regenerate.
  const confirmReplacingEdits = async () =>
    !segment.editedAt ||
    confirm({
      title: 'تمسح تعديلات المحرر؟',
      description: 'المقطع ده متعدّل في محرر الصوت، وإعادة توليده هتمسح التعديلات دي.',
      confirmLabel: 'أعد التوليد',
      destructive: true,
    });

  const retake = async (text?: string) => {
    if (await confirmReplacingEdits()) onRetake(text);
  };

  const changeVoice = async (voiceProfileId: string | null) => {
    if (!hasAudio || (await confirmReplacingEdits())) onChangeVoice(voiceProfileId);
  };

  const submitEdit = () => {
    const text = draft.trim();
    if (!text) return;
    setIsEditing(false);
    if (hasAudio && !imported) void retake(text);
    else onSaveText(text);
  };

  return (
    <article
      ref={(node) => {
        cardRef.current = node;
        setNodeRef(node);
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-card transition-colors',
        isDragging && 'relative z-20 shadow-2xl ring-2 ring-primary/40',
        isRendering
          ? 'border-primary/60 ring-2 ring-primary/15'
          : isSelected
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-border-strong',
        displayStatus === 'FAILED' && 'border-destructive/40',
      )}
    >
      <header
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`المقطع ${number} — اسحبه عشان تغيّر مكانه`}
        title="اسحب عشان تغيّر الترتيب"
        className={cn(
          'group/handle flex touch-none select-none items-center gap-2 rounded-t-2xl px-3.5 pt-3 outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <Checkbox
          checked={isSelected}
          aria-label={`حدد المقطع ${number}`}
          title="حدد (Shift لتحديد كل اللي بينهم)"
          className="shrink-0 cursor-pointer"
          // Not a drag start, and the selection is controlled here (Shift = range).
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            onToggleSelect(e.shiftKey);
          }}
        />
        <span
          className={cn(
            'numeric grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-xs font-bold',
            hasAudio ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {number}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {displayStatus !== 'COMPLETED' && (
            <Badge
              variant={
                displayStatus === 'FAILED' ? 'destructive' : displayStatus === 'PROCESSING' ? 'accent' : 'secondary'
              }
            >
              {displayStatus === 'PROCESSING' && <Loader2 className="animate-spin" />}
              {STATUS_LABELS[displayStatus]}
            </Badge>
          )}
          {hasAudio && segment.duration != null && (
            <Badge variant="outline">
              <span className="numeric">{formatDuration(segment.duration)}</span>
            </Badge>
          )}
          {imported && (
            <Badge variant="outline">
              <imported.icon />
              {imported.label}
            </Badge>
          )}
          {hasAudio && segment.editedAt && <Badge variant="accent">متعدّل</Badge>}
        </div>
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover/handle:text-foreground" />
      </header>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3 pt-2.5">
        <ClampedText text={segment.text} />

        {!imported && (
          <div>
            <SegmentVoiceDialog
              title={`صوت المقطع رقم ${number}`}
              modelId={segment.modelId}
              voiceProfileId={segment.voiceProfileId}
              hasAudio={hasAudio}
              disabled={isRendering || (hasAudio && isBusy)}
              onConfirm={changeVoice}
            >
              <button
                type="button"
                title="غيّر صوت المقطع ده"
                className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-semibold transition-colors hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-45"
              >
                <Mic className="h-3 w-3 shrink-0" />
                <span className="truncate">{segment.voiceProfile?.name ?? 'الصوت الافتراضي'}</span>
              </button>
            </SegmentVoiceDialog>
          </div>
        )}

        {displayStatus === 'FAILED' && segment.error && (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-3 min-w-0 break-words" title={segment.error}>
              {segment.error}
            </span>
          </p>
        )}

        {/* Pinned to the bottom so players line up across a row of cards. */}
        <div className="mt-auto">
          {hasAudio ? (
            <AudioPlayer src={`/api/audio/${segment.audioPath}`} compact />
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
        {imported ? (
          <span className="px-1.5 text-[11px] text-muted-foreground">مش بيتولّد — عدّله في المحرر</span>
        ) : (
          <Button
            variant={hasAudio ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => void retake()}
            disabled={isBusy}
            title="بيتولّد بصوت المقطع نفسه، وبإعدادات النموذج اللي في الحلقة"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {hasAudio ? 'إعادة التوليد' : 'ولّده دلوقتي'}
          </Button>
        )}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={openEditor}
            disabled={isRendering}
            title={imported ? 'تغيير الاسم' : 'تعديل النص'}
            aria-label={imported ? 'تغيير الاسم' : 'تعديل النص'}
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
              <Link href={`/editor?segment=${segment.id}`} aria-label="تعديل الصوت">
                <AudioWaveform className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" title="أكتر" aria-label="اختيارات أكتر">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onInsertAfter}>
                <SquarePlus className="h-3.5 w-3.5" />
                ضيف صوت بعده
              </DropdownMenuItem>
              {hasAudio && (
                <DropdownMenuItem onSelect={() => setIsSaving(true)}>
                  <Library className="h-3.5 w-3.5" />
                  احفظه في المكتبة
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={isRendering}
                className="text-destructive focus:text-destructive"
                onSelect={async () => {
                  if (
                    await confirm({
                      title: `تمسح المقطع رقم ${number}؟`,
                      confirmLabel: 'امسح',
                      destructive: true,
                    })
                  ) {
                    onDelete();
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                مسح
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </footer>

      {hasAudio && (
        <SaveClipDialog
          generationId={segment.id}
          defaultName={segment.text}
          open={isSaving}
          onOpenChange={setIsSaving}
        />
      )}

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{imported ? `اسم المقطع رقم ${number}` : `تعديل المقطع رقم ${number}`}</DialogTitle>
            <DialogDescription>
              {imported
                ? 'الاسم بيظهر على الكارت بس — الصوت نفسه مش بيتغيّر.'
                : hasAudio
                  ? 'المقطع ده متولّد، فالحفظ هيعيد توليده بالنص الجديد. لو إعادة التوليد فشلت، التسجيل القديم بيفضل زي ما هو.'
                  : 'المقطع لسه ماتولّدش، فالتعديل هيتحفظ وبس.'}
            </DialogDescription>
          </DialogHeader>
          {imported ? (
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} dir="auto" />
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              dir="rtl"
              className="text-base leading-relaxed"
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              إلغاء
            </Button>
            <Button onClick={submitEdit} disabled={!draft.trim() || (hasAudio && !imported && isBusy)}>
              {hasAudio && !imported ? 'حفظ وإعادة التوليد' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
