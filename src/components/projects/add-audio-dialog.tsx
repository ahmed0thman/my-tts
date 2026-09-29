'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, FileAudio, Library, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AudioFilePicker } from '@/components/clips/audio-file-picker';
import { ClipRecorder } from '@/components/clips/clip-recorder';
import { ClipPreviewButton } from '@/components/clips/clip-preview-button';
import { useAddAudioSegment, useClips } from '@/hooks/use-clips';
import type { ProcessedRecording } from '@/lib/audio-encode';
import { cn, formatDuration } from '@/lib/utils';

/**
 * «إضافة صوت»: put audio that no model rendered into an episode — a saved
 * clip from the library, an uploaded file, or a recording in the user's own
 * voice — at any point in the running order. It lands as a finished segment:
 * it merges with the rest, opens in the editor, and is never re-rendered.
 */

type Tab = 'library' | 'upload' | 'recording';

interface AddAudioDialogProps {
  episodeId: string;
  segments: { id: string; text: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Slot to insert at (0 = first); null = after the last segment. */
  defaultPosition?: number | null;
}

const toValue = (position: number | null) => (position == null ? 'end' : String(position));
const fromValue = (value: string) => (value === 'end' ? null : Number(value));

export function AddAudioDialog({ episodeId, segments, open, onOpenChange, defaultPosition = null }: AddAudioDialogProps) {
  const [tab, setTab] = useState<Tab>('library');
  const [position, setPosition] = useState(toValue(defaultPosition));
  const [clipId, setClipId] = useState<string | null>(null);
  const [audio, setAudio] = useState<ProcessedRecording | null>(null);
  const [name, setName] = useState('');
  const [keep, setKeep] = useState(false);
  const { data: clips, isLoading } = useClips();
  const add = useAddAudioSegment(episodeId);

  useEffect(() => {
    if (!open) return;
    setPosition(toValue(defaultPosition));
    setClipId(null);
    setAudio(null);
    setName('');
    setKeep(false);
  }, [open, defaultPosition]);

  // Open on the library when it has something in it; otherwise on upload.
  useEffect(() => {
    if (open && clips) setTab(clips.length > 0 ? 'library' : 'upload');
  }, [open, clips]);

  const ready = tab === 'library' ? !!clipId : !!audio && !!name.trim();

  const submit = () => {
    const at = fromValue(position);
    const done = { onSuccess: () => onOpenChange(false) };
    if (tab === 'library') {
      if (clipId) add.mutate({ kind: 'library', clipId, position: at }, done);
    } else if (audio) {
      add.mutate({ kind: tab, file: audio.file, name: name.trim(), position: at, saveToLibrary: keep }, done);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة صوت للحلقة</DialogTitle>
          <DialogDescription>
            مقطع من مكتبتك، ملف عندك، أو تسجيل بصوتك — بيتدمج مع باقي المقاطع زي أي مقطع.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as Tab);
            setAudio(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="library">
              <Library className="h-3.5 w-3.5" />
              من المكتبة
            </TabsTrigger>
            <TabsTrigger value="upload">
              <FileAudio className="h-3.5 w-3.5" />
              ارفع ملف
            </TabsTrigger>
            <TabsTrigger value="recording">
              <Mic className="h-3.5 w-3.5" />
              سجّل
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library">
            {isLoading ? (
              <div className="grid h-32 place-items-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !clips?.length ? (
              <div className="space-y-2 rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">
                <p>المكتبة لسه فاضية.</p>
                <p className="text-xs">
                  ارفع ملف أو سجّل هنا وعلّم «احفظه في المكتبة»، أو احفظ أي مقطع من زرار{' '}
                  <Library className="inline h-3 w-3" /> على الكارت بتاعه.
                </p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto p-0.5">
                {clips.map((clip) => (
                  <li key={clip.id}>
                    <div
                      role="radio"
                      aria-checked={clipId === clip.id}
                      tabIndex={0}
                      onClick={() => setClipId(clip.id)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setClipId(clip.id)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                        clipId === clip.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40',
                      )}
                    >
                      <ClipPreviewButton audioPath={clip.audioPath} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold" dir="auto">
                        {clip.name}
                      </span>
                      <span className="numeric shrink-0 text-xs text-muted-foreground">
                        {formatDuration(clip.duration)}
                      </span>
                      <Check className={cn('h-4 w-4 shrink-0 text-primary', clipId !== clip.id && 'invisible')} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="pt-2 text-[11px] text-muted-foreground">
              بيتحط نسخة منه، فتعديلها في الحلقة مش بيغيّر اللي في{' '}
              <Link href="/library" className="text-primary hover:underline">
                المكتبة
              </Link>
              .
            </p>
          </TabsContent>

          <TabsContent value="upload">
            <AudioFilePicker
              onReady={(next, fileName) => {
                setAudio(next);
                if (next && fileName && !name.trim()) setName(fileName);
              }}
            />
          </TabsContent>

          <TabsContent value="recording">
            <ClipRecorder
              onReady={(next) => {
                setAudio(next);
                if (next && !name.trim()) setName('تسجيل بصوتي');
              }}
            />
          </TabsContent>
        </Tabs>

        {tab !== 'library' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="audio-name">الاسم</Label>
              <Input
                id="audio-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="بيظهر على كارت المقطع"
                maxLength={120}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={keep} onCheckedChange={(checked) => setKeep(checked === true)} />
              احفظه في المكتبة كمان، عشان أستخدمه في حلقات تانية
            </label>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>مكانه في الحلقة</Label>
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger dir="rtl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl" className="max-h-72">
              <SelectItem value="end">في الآخر</SelectItem>
              {segments.length > 0 && <SelectItem value="0">في الأول</SelectItem>}
              {segments.slice(0, -1).map((segment, index) => (
                <SelectItem key={segment.id} value={String(index + 1)}>
                  بعد المقطع <span className="numeric">{index + 1}</span> —{' '}
                  <span className="text-muted-foreground">
                    {segment.text.length > 40 ? `${segment.text.slice(0, 40)}…` : segment.text}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={!ready || add.isPending}>
            {add.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            ضيفه للحلقة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
