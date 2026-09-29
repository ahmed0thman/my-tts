'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ChevronLeft, Clock, Layers, Loader2, Mic, Pencil, Play, SquarePlus, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAddSegments,
  useApplyVoiceToSegments,
  useDeleteEpisode,
  useDeleteSegment,
  useDeleteSegments,
  useEpisode,
  useMergeEpisode,
  useReorderSegments,
  useRenderQueue,
  useRetakeSegment,
  useSetSegmentVoice,
  useSetVoiceForSegments,
  useUpdateSegmentText,
  type EpisodeDetail,
} from '@/hooks/use-episodes';
import { EpisodeDialog } from '@/components/projects/episode-dialog';
import { ScriptComposer } from '@/components/projects/script-composer';
import { SegmentCard } from '@/components/projects/segment-card';
import { ClipGrid, PaneHeading, WorkspaceSplit } from '@/components/layout/workspace-split';
import { MergePanel } from '@/components/projects/merge-panel';
import { AddAudioDialog } from '@/components/projects/add-audio-dialog';
import { SegmentSelectionBar } from '@/components/projects/segment-selection-bar';
import { VoiceControls } from '@/components/generation/voice-controls';
import { GenerationProgress } from '@/components/generation/generation-progress';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/providers/confirm-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { DEFAULT_MODEL_ID } from '@/lib/models';
import { formatDuration } from '@/lib/utils';
import { episodeKindLabel } from '@/lib/projects';
import { Badge } from '@/components/ui/badge';
import type { RenderSettings } from '@/lib/validations';
import { useVoiceProfiles } from '@/hooks/use-voice-profiles';

const DRAG_INSTRUCTIONS = {
  draggable: 'عشان تحرّك المقطع: دوس مسافة، حرّكه بالأسهم، ودوس مسافة تاني عشان تسيبه، أو Escape عشان تلغي.',
};
const DRAG_ANNOUNCEMENTS: Announcements = {
  onDragStart: () => 'مسكت المقطع',
  onDragOver: ({ over }) => (over ? 'فوق مكان مقطع تاني' : 'برّه القايمة'),
  onDragEnd: ({ over }) => (over ? 'اتحط في مكانه الجديد' : 'اتلغى التحريك'),
  onDragCancel: () => 'اتلغى التحريك',
};

interface SettingsFormValues {
  modelId: string;
  params: Record<string, number>;
  /** `'default'` is the select's sentinel for "the model's own voice". */
  voiceProfileId: string;
  outputDir: string;
}

export default function EpisodePage() {
  const { id: projectId, episodeId } = useParams<{ id: string; episodeId: string }>();
  const { data: episode, isLoading, error } = useEpisode(episodeId);

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

  if (error || !episode) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error?.message ?? 'الحلقة مش موجودة'}</p>
        <Button asChild variant="outline">
          <Link href={`/projects/${projectId}`}>رجوع للمشروع</Link>
        </Button>
      </div>
    );
  }

  // Keyed so switching episodes remounts with that episode's own settings.
  return <EpisodeWorkspace key={episode.id} episode={episode} />;
}

function EpisodeWorkspace({ episode }: { episode: EpisodeDetail }) {
  const router = useRouter();

  // An episode with a voice of its own (rendered before, or copied from a
  // sibling when it was created) keeps it; only one with none inherits the
  // studio's last-used model and folder. Fixed at mount.
  const restoreSaved = useRef(!episode.modelId).current;

  const form = useForm<SettingsFormValues>({
    defaultValues: {
      modelId: episode.modelId ?? DEFAULT_MODEL_ID,
      params: (episode.params as Record<string, number>) ?? {},
      voiceProfileId: episode.voiceProfileId ?? 'default',
      outputDir: episode.outputDir ?? '',
    },
  });
  const [gapMs, setGapMs] = useState(episode.gapMs);
  // «إضافة صوت»: open, and the slot it inserts at (null = the end).
  const [addAudio, setAddAudio] = useState<{ open: boolean; position: number | null }>({ open: false, position: null });

  const addSegments = useAddSegments(episode.id);
  const retake = useRetakeSegment(episode.id);
  const setVoice = useSetSegmentVoice(episode.id);
  const applyVoice = useApplyVoiceToSegments(episode.id);
  const { data: profiles } = useVoiceProfiles();
  const updateText = useUpdateSegmentText(episode.id);
  const reorder = useReorderSegments(episode.id);
  const sensors = useSensors(
    // A few pixels before a drag starts, so a click on the header is still a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = episode.segments.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(ids, from, to));
  };
  const deleteSegment = useDeleteSegment(episode.id);
  const merge = useMergeEpisode(episode.id);
  const deleteEpisode = useDeleteEpisode();
  const queue = useRenderQueue(episode.id);
  const confirm = useConfirm();
  const projectHref = `/projects/${episode.project.id}`;

  const renderingId = queue.state?.currentId ?? (retake.isPending ? retake.variables?.id : null) ?? null;
  const isRendering = queue.isRunning || retake.isPending;
  const isBusy = isRendering || merge.isPending;

  const settings = (): RenderSettings => {
    const values = form.getValues();
    return {
      modelId: values.modelId,
      params: values.params ?? {},
      voiceProfileId: values.voiceProfileId === 'default' ? undefined : values.voiceProfileId,
      outputDir: values.outputDir || undefined,
    };
  };

  // A retake keeps the segment's own voice; the sidebar's model and knobs apply.
  const modelSettings = (): RenderSettings => {
    const { modelId, params } = settings();
    return { modelId, params };
  };

  const segments = episode.segments;

  // The grid's selection. Ids that no longer exist (deleted) simply drop out.
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const lastToggled = useRef<string | null>(null);
  const selected = segments.filter((s) => selection.has(s.id));
  const deleteMany = useDeleteSegments(episode.id);
  const setVoiceMany = useSetVoiceForSegments(episode.id);

  const toggleSelect = (id: string, range: boolean) => {
    setSelection((current) => {
      const next = new Set(current);
      const from = lastToggled.current ? segments.findIndex((s) => s.id === lastToggled.current) : -1;
      const to = segments.findIndex((s) => s.id === id);
      if (range && from >= 0 && to >= 0) {
        // Shift: the whole run takes the state of the clicked card's new state.
        const on = !current.has(id);
        for (const s of segments.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          if (on) next.add(s.id);
          else next.delete(s.id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastToggled.current = id;
  };
  const clearSelection = () => {
    setSelection(new Set());
    lastToggled.current = null;
  };

  const regenerateSelected = async () => {
    const targets = selected.filter((s) => s.source === 'tts');
    const edited = targets.filter((s) => s.editedAt).length;
    const skipped = selected.length - targets.length;
    const ok = await confirm({
      title: `تعيد توليد ${targets.length} مقطع؟`,
      description:
        'كل مقطع بصوته، وبإعدادات النموذج اللي على اليمين. لو مقطع فشل، تسجيله القديم بيفضل زي ما هو.' +
        (edited > 0 ? `\n${edited} منهم متعدّل في محرر الصوت، والتعديلات دي هتتمسح.` : '') +
        (skipped > 0 ? `\n${skipped} صوت متضاف (ملف أو تسجيل) مش هيتأثر.` : ''),
      confirmLabel: 'أعد التوليد',
      destructive: edited > 0,
    });
    if (!ok) return;
    const { modelId, params } = modelSettings();
    void queue.start(
      targets.map((s) => s.id),
      { modelId, params },
    );
  };

  const voiceSelected = async (voiceProfileId: string | null) => {
    const ids = selected.filter((s) => s.source === 'tts').map((s) => s.id);
    try {
      const { queued, toRender } = await setVoiceMany.mutateAsync({ ids, voiceProfileId });
      const edited = segments.filter((s) => toRender.includes(s.id) && s.editedAt).length;
      if (
        toRender.length > 0 &&
        (edited === 0 ||
          (await confirm({
            title: `تمسح تعديلات المحرر في ${edited} مقطع؟`,
            description: 'المقاطع دي متعدّلة في محرر الصوت، وتغيير الصوت هيعيد توليدها ويمسح التعديلات.',
            confirmLabel: 'غيّر الصوت',
            destructive: true,
          })))
      ) {
        void queue.start(toRender, { voiceProfileId });
      } else if (queued > 0) {
        toast.success(`${queued} مقطع هيتولّد بالصوت الجديد`);
      }
    } catch {
      // The hook already showed the error.
    }
  };

  const deleteSelected = async () => {
    const ok = await confirm({
      title: `تمسح ${selected.length} مقطع؟`,
      description: 'المقاطع وملفات الصوت بتاعتها هتتمسح. المحفوظ في المكتبة مش هيتأثر.',
      confirmLabel: 'امسح',
      destructive: true,
    });
    if (!ok) return;
    deleteMany.mutate(
      selected.map((s) => s.id),
      { onSuccess: clearSelection },
    );
  };

  // The sidebar voice is what new segments get. Segments already queued or
  // rendered keep theirs until changed — one by one, or all at once here.
  const formVoice = form.watch('voiceProfileId');
  const episodeVoiceId = formVoice && formVoice !== 'default' ? formVoice : null;
  const episodeVoiceName = episodeVoiceId
    ? (profiles?.find((p: any) => p.id === episodeVoiceId)?.name ?? 'الصوت المختار')
    : 'الصوت الافتراضي';
  // Uploads, recordings and library clips have no voice to change.
  const otherVoiceCount = segments.filter((s) => s.source === 'tts' && s.voiceProfileId !== episodeVoiceId).length;

  const handleApplyVoice = async () => {
    try {
      const { queued, toRender } = await applyVoice.mutateAsync(episodeVoiceId);
      const rendered = segments.filter((s) => toRender.includes(s.id));
      const edited = rendered.filter((s) => s.editedAt).length;
      if (
        rendered.length > 0 &&
        (await confirm({
          title: `تعيد توليد ${rendered.length} مقطع بـ«${episodeVoiceName}»؟`,
          description:
            `المقاطع دي متولّدة بصوت تاني، وهتتولّد من جديد واحد ورا التاني.` +
            (edited > 0 ? `\n${edited} منهم متعدّل في محرر الصوت، والتعديلات دي هتتمسح.` : ''),
          confirmLabel: 'أعد التوليد',
          destructive: edited > 0,
        }))
      ) {
        void queue.start(toRender, { voiceProfileId: episodeVoiceId });
      } else if (queued > 0) {
        toast.success(`${queued} مقطع هيتولّد بـ«${episodeVoiceName}»`);
      }
    } catch {
      // The hook already showed the error.
    }
  };
  const unfinishedIds = segments.filter((s) => s.status !== 'COMPLETED').map((s) => s.id);
  const renderedSeconds = segments.reduce((sum, s) => sum + (s.duration ?? 0), 0);

  const handleAdd = async (texts: string[], generate: boolean) => {
    try {
      const ids = await addSegments.mutateAsync({ texts, settings: settings() });
      if (generate) {
        void queue.start(ids);
      } else {
        toast.success(`اتضاف ${ids.length} مقطع للقايمة`);
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `تمسح "${episode.title}" بكل مقاطعها؟`,
      description: 'النسخة المصدّرة في مجلدك مش هتتمسح.',
      confirmLabel: 'امسح',
      destructive: true,
    });
    if (!ok) return;
    deleteEpisode.mutate(episode.id, { onSuccess: () => router.push(projectHref) });
  };

  const header = (
    <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <nav
          aria-label="المسار"
          className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground"
        >
          <Link href="/projects" className="hover:text-foreground">
            المشاريع
          </Link>
          <ChevronLeft className="h-3.5 w-3.5" />
          <Link href={projectHref} className="hover:text-foreground">
            {episode.project.title}
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-extrabold tracking-tight">{episode.title}</h1>
          <Badge variant="accent">{episodeKindLabel(episode.kind)}</Badge>
        </div>
        {episode.description && (
          <p className="line-clamp-2 max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">
            {episode.description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <EpisodeDialog projectId={episode.project.id} episode={episode}>
          <Button variant="outline" size="sm">
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </Button>
        </EpisodeDialog>
        <Button
          variant="ghost"
          size="sm"
          className="hover:bg-destructive/10 hover:text-destructive"
          disabled={isBusy || deleteEpisode.isPending}
          onClick={handleDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          مسح
        </Button>
      </div>
    </header>
  );

  const controls = (
    <>
      <ScriptComposer isBusy={isBusy} isAdding={addSegments.isPending} onAdd={handleAdd} />
      <VoiceControls restoreSaved={restoreSaved} showOutputPath={false} />
      <MergePanel
        episode={episode}
        gapMs={gapMs}
        onGapChange={setGapMs}
        isBusy={isRendering}
        isMerging={merge.isPending}
        onMerge={() => merge.mutate({ gapMs, outputDir: form.getValues('outputDir') || undefined })}
        restoreSaved={restoreSaved}
      />
    </>
  );

  const toolbar = (
    <>
      {selected.length > 0 && (
        <SegmentSelectionBar
          selected={selected}
          total={segments.length}
          isBusy={isBusy || setVoiceMany.isPending}
          touchesRendering={deleteMany.isPending || selected.some((s) => s.id === renderingId)}
          onSelectAll={() => setSelection(new Set(segments.map((s) => s.id)))}
          onClear={clearSelection}
          onRegenerate={() => void regenerateSelected()}
          onVoice={(voice) => void voiceSelected(voice)}
          onDelete={() => void deleteSelected()}
        />
      )}
      <PaneHeading
        title="المقاطع بالترتيب"
        meta={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              <span className="numeric font-semibold text-foreground">{segments.length}</span> مقطع
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span className="numeric font-semibold text-foreground">{formatDuration(renderedSeconds)}</span> متولّد
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setAddAudio({ open: true, position: null })}>
              <SquarePlus className="h-3.5 w-3.5" />
              إضافة صوت
            </Button>
            {!isRendering && unfinishedIds.length > 0 && (
              <Button size="sm" disabled={isBusy} onClick={() => void queue.start(unfinishedIds)}>
                <Play className="h-3.5 w-3.5" />
                ولّد الباقي
                <span className="numeric rounded-md bg-primary-foreground/15 px-1.5 text-[11px] leading-5">
                  {unfinishedIds.length}
                </span>
              </Button>
            )}
          </>
        }
      />

      {/* What is rendering now, and the way to stop between segments. */}
      {isRendering && (
        <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {queue.state ? (
                <span>
                  بيتولّد المقطع{' '}
                  <span className="numeric">{segments.findIndex((s) => s.id === queue.state?.currentId) + 1}</span> —{' '}
                  <span className="numeric">{queue.state.done}</span> من{' '}
                  <span className="numeric">{queue.state.total}</span> خلصوا
                </span>
              ) : (
                'بيتعاد توليد المقطع...'
              )}
            </span>
            {queue.isRunning && (
              <Button variant="outline" size="sm" onClick={queue.stop}>
                <Square className="h-3.5 w-3.5" />
                وقّف بعد المقطع ده
              </Button>
            )}
          </div>
          <GenerationProgress isPending={isRendering} />
        </div>
      )}

      {otherVoiceCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm">
            <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="numeric font-bold">{otherVoiceCount}</span> مقطع بصوت غير «{episodeVoiceName}» اللي في
              إعدادات الحلقة
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy || applyVoice.isPending}
            onClick={() => void handleApplyVoice()}
          >
            {applyVoice.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            خلّي كل المقاطع بالصوت ده
          </Button>
        </div>
      )}
    </>
  );

  return (
    <Form {...form}>
      <WorkspaceSplit header={header} controls={controls} toolbar={toolbar}>
        {segments.length === 0 ? (
          <p className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center text-sm text-muted-foreground">
            لسه مفيش مقاطع. الصق السكريبت على اليمين — كل مقطع هيظهر هنا كارت تسمعه وتعيده لوحده. عندك تسجيل أو مقدمة
            جاهزة؟ «إضافة صوت» فوق.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements: DRAG_ANNOUNCEMENTS, screenReaderInstructions: DRAG_INSTRUCTIONS }}
          >
            <SortableContext items={segments.map((s) => s.id)} strategy={rectSortingStrategy}>
              <ClipGrid>
                {segments.map((segment, index) => (
                  <SegmentCard
                    key={segment.id}
                    segment={segment}
                    number={index + 1}
                    isRendering={renderingId === segment.id}
                    isBusy={isBusy}
                    onRetake={(text) => retake.mutate({ id: segment.id, text, settings: modelSettings() })}
                    onChangeVoice={(voiceProfileId) =>
                      segment.status === 'COMPLETED' && segment.audioPath
                        ? retake.mutate({ id: segment.id, voiceProfileId, settings: modelSettings() })
                        : setVoice.mutate({ id: segment.id, voiceProfileId })
                    }
                    onSaveText={(text) => updateText.mutate({ id: segment.id, text })}
                    onDelete={() => deleteSegment.mutate(segment.id)}
                    onInsertAfter={() => setAddAudio({ open: true, position: index + 1 })}
                    isSelected={selection.has(segment.id)}
                    onToggleSelect={(range) => toggleSelect(segment.id, range)}
                  />
                ))}
              </ClipGrid>
            </SortableContext>
          </DndContext>
        )}
      </WorkspaceSplit>
      <AddAudioDialog
        episodeId={episode.id}
        segments={segments}
        open={addAudio.open}
        onOpenChange={(open) => setAddAudio((current) => ({ ...current, open }))}
        defaultPosition={addAudio.position}
      />
    </Form>
  );
}
