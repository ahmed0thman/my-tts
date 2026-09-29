'use client';

import { useState } from 'react';
import { ClipboardCopy, ClipboardPaste, FileText, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GenerationProgress } from '@/components/generation/generation-progress';
import { useConfirm } from '@/providers/confirm-provider';
import { languageLabel, parseTranslation, SOURCE_LANGUAGES, transcriptText } from '@/lib/dubbing';
import { cn } from '@/lib/utils';
import type { DubDetail } from '@/hooks/use-dubs';

interface TranscriptPanelProps {
  dub: DubDetail;
  isBusy: boolean;
  isTranscribing: boolean;
  onTranscribe: (language: string) => void;
  isApplying: boolean;
  /** Resolves true when the texts were applied, so the dialog can close. */
  onApplyTranslation: (texts: string[]) => Promise<boolean>;
  onRestoreSource: () => void;
}

/**
 * Step one: what is said in the video. Transcribe it; to dub into another
 * language, copy the transcript out (one line per timed line), translate it
 * anywhere, and paste it back line for line.
 */
export function TranscriptPanel({
  dub,
  isBusy,
  isTranscribing,
  onTranscribe,
  isApplying,
  onApplyTranslation,
  onRestoreSource,
}: TranscriptPanelProps) {
  const confirm = useConfirm();
  const [language, setLanguage] = useState('auto');
  const [isPasting, setIsPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const lines = dub.lines;
  const transcribed = !!dub.transcribedAt && lines.length > 0;
  const translatedCount = lines.filter((l) => l.sourceText && l.sourceText !== l.text).length;
  const renderedCount = lines.filter((l) => l.status === 'COMPLETED').length;
  const parsed = pasted.trim() ? parseTranslation(pasted, lines.length) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText(lines));
      toast.success(`اتنسخ ${lines.length} سطر`, {
        description: 'ترجمه زي ما هو، سطر قصاد سطر، والصقه تاني من «الصق الترجمة».',
      });
    } catch {
      toast.error('معرفناش ننسخ — المتصفح منع الوصول للحافظة');
    }
  };

  const transcribe = async () => {
    if (
      transcribed &&
      !(await confirm({
        title: 'تفرّغ الفيديو من جديد؟',
        description:
          'الأسطر الحالية هتتمسح' +
          (renderedCount > 0 ? ` ومعاها ${renderedCount} تسجيل متولّد` : '') +
          (translatedCount > 0 ? '، والترجمة اللي حطيتها' : '') +
          '.',
        confirmLabel: 'فرّغ من جديد',
        destructive: true,
      }))
    )
      return;
    onTranscribe(language);
  };

  const apply = async () => {
    if (!parsed?.ok) return;
    if (
      renderedCount > 0 &&
      !(await confirm({
        title: 'تحط النص الجديد؟',
        description: 'الأسطر اللي نصها هيتغيّر هتفقد تسجيلها وترجع تستنى دورها في التوليد.',
        confirmLabel: 'حط النص',
      }))
    )
      return;
    if (await onApplyTranslation(parsed.lines)) {
      setIsPasting(false);
      setPasted('');
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-plate md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-1 text-primary">
            <FileText className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold tracking-tight">كلام الفيديو</h3>
        </div>
        {transcribed && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{languageLabel(dub.language)}</Badge>
            <Badge variant="secondary">
              <span className="numeric">{lines.length}</span> سطر
            </Badge>
            {translatedCount > 0 && <Badge variant="accent">مترجم</Badge>}
          </div>
        )}
      </div>

      {!dub.hasAudio ? (
        <p className="text-xs leading-relaxed text-muted-foreground">الفيديو ده مفيهوش صوت، فمفيش كلام نفرّغه.</p>
      ) : (
        <>
          {!transcribed && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              هنسمع الفيديو ونكتب كل جملة بوقت بدايتها ونهايتها. بياخد حوالي نص مدة الفيديو.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={setLanguage} disabled={isTranscribing}>
              <SelectTrigger dir="rtl" className="h-9 w-36 shrink-0 text-xs" aria-label="لغة الفيديو">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {SOURCE_LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="text-xs">
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="flex-1"
              variant={transcribed ? 'outline' : 'default'}
              disabled={isBusy || isTranscribing}
              onClick={() => void transcribe()}
            >
              {isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : transcribed ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {transcribed ? 'فرّغ من جديد' : 'فرّغ الكلام'}
            </Button>
          </div>
          {isTranscribing && (
            <div className="overflow-hidden rounded-xl border border-primary/30">
              <GenerationProgress isPending />
            </div>
          )}
        </>
      )}

      {transcribed && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            عايزها بلغة تانية؟ انسخ النص، ترجمه في أي مكان (سطر قصاد سطر)، والصق الترجمة. النموذج بيتكلم مصري
            وإنجليزي.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              انسخ النص
            </Button>
            <Button variant="outline" size="sm" disabled={isBusy} onClick={() => setIsPasting(true)}>
              <ClipboardPaste className="h-3.5 w-3.5" />
              الصق الترجمة
            </Button>
          </div>
          {translatedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={isBusy || isApplying}
              onClick={async () => {
                if (
                  await confirm({
                    title: 'ترجّع الكلام الأصلي؟',
                    description: `${translatedCount} سطر هيرجع لكلامه الأصلي، واللي منهم متولّد هيفقد تسجيله.`,
                    confirmLabel: 'رجّع الأصل',
                  })
                )
                  onRestoreSource();
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              رجّع الكلام الأصلي
            </Button>
          )}
        </div>
      )}

      <Dialog open={isPasting} onOpenChange={setIsPasting}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>الصق الترجمة</DialogTitle>
            <DialogDescription>
              سطر لكل سطر في الفيديو وبنفس الترتيب — السطر رقم ١ بيتقال مكان السطر رقم ١ وهكذا. الأسطر الفاضية مش
              بتتحسب، والأرقام في أول الأسطر بتتشال.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={12}
            dir="auto"
            placeholder={transcriptText(lines.slice(0, 3))}
            className="font-medium leading-relaxed"
          />
          <div className="flex items-start justify-between gap-3 text-xs">
            <span
              className={cn(
                'numeric shrink-0 font-bold',
                !parsed ? 'text-muted-foreground' : parsed.ok ? 'text-success' : 'text-destructive',
              )}
            >
              {parsed ? (parsed.ok ? parsed.lines.length : parsed.count) : 0} / {lines.length} سطر
            </span>
            {parsed && !parsed.ok && <span className="text-destructive">{parsed.error}</span>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsPasting(false)}>
              إلغاء
            </Button>
            <Button disabled={!parsed?.ok || isApplying} onClick={() => void apply()}>
              {isApplying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              حط النص على الأسطر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
