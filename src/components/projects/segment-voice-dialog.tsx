'use client';

import { useState, type ReactNode } from 'react';
import { useVoiceProfiles } from '@/hooks/use-voice-profiles';
import { useModels } from '@/hooks/use-models';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatDuration } from '@/lib/utils';

/** The select's sentinel for "the model's own voice" — same as VoiceControls. */
const DEFAULT_VOICE = 'default';

interface SegmentVoiceDialogProps {
  /** Dialog title, e.g. «صوت المقطع رقم 3» or «صوت 5 مقاطع». */
  title: string;
  modelId: string;
  /** The current voice; `undefined` when several segments with different voices are selected. */
  voiceProfileId: string | null | undefined;
  /** The segment (or some of the selection) has audio, so a new voice means rendering it again. */
  hasAudio: boolean;
  disabled?: boolean;
  onConfirm: (voiceProfileId: string | null) => void;
  children: ReactNode;
}

/**
 * Pick the voice a segment — or the grid's selection — speaks with: for an
 * episode with more than one speaker, or to fix segments queued with the
 * wrong voice.
 */
export function SegmentVoiceDialog({
  title,
  modelId,
  voiceProfileId,
  hasAudio,
  disabled,
  onConfirm,
  children,
}: SegmentVoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(voiceProfileId ?? DEFAULT_VOICE);
  const { data: profiles } = useVoiceProfiles();
  const { data: modelData } = useModels();

  // A clip past the model's window makes it recite the reference, and the
  // server refuses it; show that here instead of after the click.
  const cap = modelData?.models.find((m) => m.id === modelId)?.maxReferenceSeconds ?? null;
  const tooLong = (duration: number | null) => cap !== null && duration !== null && duration > cap;

  const mixed = voiceProfileId === undefined;
  const current = voiceProfileId ?? DEFAULT_VOICE;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(current);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild disabled={disabled}>
        {children}
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {hasAudio
              ? 'المتولّد هيتعاد توليده بالصوت الجديد. لو إعادة التوليد فشلت، التسجيل القديم بيفضل زي ما هو.'
              : 'لسه ماتولّدش، فالصوت هيتحفظ ويتولّد بيه لما دوره ييجي.'}
          </DialogDescription>
        </DialogHeader>

        <Select value={draft} onValueChange={setDraft}>
          <SelectTrigger dir="rtl" className="h-11 w-full">
            <SelectValue placeholder="اختر الصوت" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value={DEFAULT_VOICE}>الصوت الافتراضي</SelectItem>
            {profiles?.map((profile: any) => (
              <SelectItem key={profile.id} value={profile.id} disabled={tooLong(profile.duration)}>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{profile.name}</span>
                  {profile.duration != null && (
                    <span className="numeric text-[11px] text-muted-foreground">{formatDuration(profile.duration)}</span>
                  )}
                  {tooLong(profile.duration) && (
                    <span className="text-[11px] text-destructive">أطول من {cap} ثواني</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button
            disabled={!mixed && draft === current}
            onClick={() => {
              onConfirm(draft === DEFAULT_VOICE ? null : draft);
              setOpen(false);
            }}
          >
            {hasAudio ? 'غيّر الصوت وأعد التوليد' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
