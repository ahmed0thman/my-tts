'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { ChevronLeft, Clock, Layers, Loader2, Pencil, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useApplyTranslation,
  useAssembleDub,
  useDeleteDub,
  useDub,
  useDubRenderQueue,
  useRenameDub,
  useRestoreSourceText,
  useRetakeLine,
  useTranscribeDub,
  useUpdateLineText,
  type DubDetail,
} from '@/hooks/use-dubs';
import { checkDubVoice } from '@/actions/dubs';
import { ClipGrid, PaneHeading, WorkspaceSplit } from '@/components/layout/workspace-split';
import { VoiceControls } from '@/components/generation/voice-controls';
import { GenerationProgress } from '@/components/generation/generation-progress';
import { DubLineCard } from '@/components/dubbing/dub-line-card';
import { DubOutputPanel } from '@/components/dubbing/dub-output-panel';
import { DubVideo, type DubVideoHandle } from '@/components/dubbing/dub-video';
import { TranscriptPanel } from '@/components/dubbing/transcript-panel';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/providers/confirm-provider';
import { DEFAULT_MODEL_ID } from '@/lib/models';
import { fitState, lineTiming } from '@/lib/dubbing';
import { formatDuration } from '@/lib/utils';
import type { RenderSettings } from '@/lib/validations';

interface SettingsFormValues {
  modelId: string;
  params: Record<string, number>;
  /** `'default'` is the select's sentinel for "the model's own voice". */
  voiceProfileId: string;
  outputDir: string;
}

export default function DubPage() {
  const { id } = useParams<{ id: string }>();
  const { data: dub, isLoading, error } = useDub(id);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-1/3" />
        <div className="flex flex-col gap-6 lg:flex-row">
          <Skeleton className="h-96 rounded-2xl lg:w-[430px]" />
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !dub) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error?.message ?? 'الدبلجة مش موجودة'}</p>
        <Button asChild variant="outline">
          <Link href="/dubbing">رجوع للدبلجة</Link>
        </Button>
      </div>
    );
  }

  return <DubWorkspace key={dub.id} dub={dub} />;
}

function DubWorkspace({ dub }: { dub: DubDetail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const videoRef = useRef<DubVideoHandle>(null);

  // A dub that has rendered before keeps its voice; a new one starts from the
  // studio's last-used model and folder. Fixed at mount.
  const restoreSaved = useRef(!dub.modelId).current;
  const form = useForm<SettingsFormValues>({
    defaultValues: {
      modelId: dub.modelId ?? DEFAULT_MODEL_ID,
      params: (dub.params as Record<string, number>) ?? {},
      voiceProfileId: dub.voiceProfileId ?? 'default',
      outputDir: dub.outputDir ?? '',
    },
  });
  const [background, setBackground] = useState(dub.background);
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(dub.title);

  const transcribe = useTranscribeDub(dub.id);
  const applyTranslation = useApplyTranslation(dub.id);
  const restoreSource = useRestoreSourceText(dub.id);
  const updateText = useUpdateLineText(dub.id);
  const retake = useRetakeLine(dub.id);
  const assemble = useAssembleDub(dub.id);
  const rename = useRenameDub(dub.id);
  const deleteDub = useDeleteDub();
  const queue = useDubRenderQueue(dub.id);

  const renderingId = queue.state?.currentId ?? (retake.isPending ? retake.variables?.id : null) ?? null;
  const isRendering = queue.isRunning || retake.isPending;
  const isBusy = isRendering || transcribe.isPending || assemble.isPending;

  const settings = (): RenderSettings => {
    const values = form.getValues();
    return {
      modelId: values.modelId,
      params: values.params ?? {},
      voiceProfileId: values.voiceProfileId === 'default' ? undefined : values.voiceProfileId,
      outputDir: values.outputDir || undefined,
    };
  };

  const lines = dub.lines;
  const timings = lines.map((line, index) =>
    lineTiming(line, lines.slice(index + 1).find((l) => l.startMs != null)?.startMs ?? null, dub.duration),
  );
  const overCount = lines.filter((line, index) => {
    const timing = timings[index];
    return line.status === 'COMPLETED' && line.duration != null && timing && fitState(line.duration, timing.room) === 'over';
  }).length;
  const unfinishedIds = lines.filter((l) => l.status !== 'COMPLETED').map((l) => l.id);
  const renderedIds = lines.filter((l) => l.status === 'COMPLETED').map((l) => l.id);
  const spokenSeconds = lines.reduce((sum, l) => sum + ((l.endMs ?? 0) - (l.startMs ?? 0)) / 1000, 0);

  const startQueue = async (ids: string[]) => {
    // A voice the model cannot use would fail every line; say so once.
    const check = await checkDubVoice(settings());
    if (!check.success) {
      toast.error(check.error);
      return;
    }
    void queue.start(ids, settings());
  };

  const regenerateAll = async () => {
    const edited = lines.filter((l) => l.editedAt).length;
    const ok = await confirm({
      title: `تعيد توليد كل الأسطر (${renderedIds.length})؟`,
      description:
        'بالصوت والإعدادات اللي على اليمين. لو سطر فشل، تسجيله القديم بيفضل زي ما هو.' +
        (edited > 0 ? `\n${edited} منهم متعدّل في محرر الصوت، والتعديلات دي هتتمسح.` : ''),
      confirmLabel: 'أعد التوليد',
      destructive: edited > 0,
    });
    if (ok) await startQueue(lines.map((l) => l.id));
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `تمسح "${dub.title}"؟`,
      description: 'الفيديو والأسطر والتسجيلات هتتمسح من التطبيق. النسخة المصدّرة في مجلدك مش هتتمسح.',
      confirmLabel: 'امسح',
      destructive: true,
    });
    if (ok) deleteDub.mutate(dub.id, { onSuccess: () => router.push('/dubbing') });
  };

  const header = (
    <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <nav aria-label="المسار" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link href="/dubbing" className="hover:text-foreground">
            الدبلجة
          </Link>
          <ChevronLeft className="h-3.5 w-3.5" />
        </nav>
        <h1 className="truncate text-2xl font-extrabold tracking-tight" dir="auto">
          {dub.title}
        </h1>
        <p className="truncate text-xs text-muted-foreground" dir="auto">
          <span className="numeric">{formatDuration(dub.duration)}</span>
          {dub.width && dub.height && (
            <span className="numeric">
              {' '}
              · {dub.width}×{dub.height}
            </span>
          )}{' '}
          · {dub.videoName}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTitle(dub.title);
            setIsRenaming(true);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
          تغيير الاسم
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hover:bg-destructive/10 hover:text-destructive"
          disabled={isBusy || deleteDub.isPending}
          onClick={() => void handleDelete()}
        >
          <Trash2 className="h-3.5 w-3.5" />
          مسح
        </Button>
      </div>
    </header>
  );

  const controls = (
    <>
      <DubVideo
        key={dub.outputVideoPath ?? 'original'}
        ref={videoRef}
        videoPath={dub.videoPath}
        outputPath={dub.outputVideoPath}
        posterPath={dub.posterPath}
      />
      <TranscriptPanel
        dub={dub}
        isBusy={isBusy}
        isTranscribing={transcribe.isPending}
        onTranscribe={(language) => transcribe.mutate({ language, settings: settings() })}
        isApplying={applyTranslation.isPending || restoreSource.isPending}
        onApplyTranslation={async (texts) => {
          try {
            await applyTranslation.mutateAsync(texts);
            return true;
          } catch {
            return false;
          }
        }}
        onRestoreSource={() => restoreSource.mutate()}
      />
      <VoiceControls restoreSaved={restoreSaved} showOutputPath={false} />
      <DubOutputPanel
        dub={dub}
        background={background}
        onBackgroundChange={setBackground}
        overCount={overCount}
        isBusy={isRendering || transcribe.isPending}
        isAssembling={assemble.isPending}
        onAssemble={() => assemble.mutate({ background, outputDir: form.getValues('outputDir') || undefined })}
        restoreSaved={restoreSaved}
      />
    </>
  );

  const toolbar = (
    <>
      <PaneHeading
        title="الأسطر بتوقيتها"
        meta={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              <span className="numeric font-semibold text-foreground">{lines.length}</span> سطر
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span className="numeric font-semibold text-foreground">{formatDuration(spokenSeconds)}</span> كلام
            </span>
          </span>
        }
        actions={
          !isRendering &&
          lines.length > 0 && (
            <>
              {renderedIds.length > 0 && (
                <Button variant="outline" size="sm" disabled={isBusy} onClick={() => void regenerateAll()}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  أعد توليد الكل
                </Button>
              )}
              {unfinishedIds.length > 0 && (
                <Button size="sm" disabled={isBusy} onClick={() => void startQueue(unfinishedIds)}>
                  <Play className="h-3.5 w-3.5" />
                  {renderedIds.length > 0 ? 'ولّد الباقي' : 'ولّد الكل'}
                  <span className="numeric rounded-md bg-primary-foreground/15 px-1.5 text-[11px] leading-5">
                    {unfinishedIds.length}
                  </span>
                </Button>
              )}
            </>
          )
        }
      />

      {isRendering && (
        <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {queue.state ? (
                <span>
                  بيتولّد السطر{' '}
                  <span className="numeric">{lines.findIndex((l) => l.id === queue.state?.currentId) + 1}</span> —{' '}
                  <span className="numeric">{queue.state.done}</span> من{' '}
                  <span className="numeric">{queue.state.total}</span> خلصوا
                </span>
              ) : (
                'بيتولّد السطر...'
              )}
            </span>
            {queue.isRunning && (
              <Button variant="outline" size="sm" onClick={queue.stop}>
                <Square className="h-3.5 w-3.5" />
                وقّف بعد السطر ده
              </Button>
            )}
          </div>
          <GenerationProgress isPending={isRendering} />
        </div>
      )}
    </>
  );

  return (
    <Form {...form}>
      <WorkspaceSplit header={header} controls={controls} toolbar={toolbar}>
        {lines.length === 0 ? (
          <p className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center text-sm text-muted-foreground">
            {dub.hasAudio
              ? 'لسه مفيش أسطر. دوس «فرّغ الكلام» على اليمين — كل جملة في الفيديو هتظهر هنا كارت بتوقيتها، تولّده وتسمعه لوحده.'
              : 'الفيديو ده مفيهوش صوت، فمفيش كلام نفرّغه.'}
          </p>
        ) : (
          <ClipGrid>
            {lines.map((line, index) => (
              <DubLineCard
                key={line.id}
                line={line}
                number={index + 1}
                timing={timings[index]}
                isRendering={renderingId === line.id}
                isBusy={isBusy}
                onSeek={() => videoRef.current?.playOriginalFrom((line.startMs ?? 0) / 1000)}
                onRetake={() => retake.mutate({ id: line.id, settings: settings() })}
                onSaveText={(text) => updateText.mutate({ id: line.id, text })}
              />
            ))}
          </ClipGrid>
        )}
      </WorkspaceSplit>

      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>اسم الدبلجة</DialogTitle>
          </DialogHeader>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} dir="auto" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRenaming(false)}>
              إلغاء
            </Button>
            <Button
              disabled={!title.trim() || rename.isPending}
              onClick={() => rename.mutate(title.trim(), { onSuccess: () => setIsRenaming(false) })}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
