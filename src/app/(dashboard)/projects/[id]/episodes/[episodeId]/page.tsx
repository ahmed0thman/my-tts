'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { ChevronLeft, Clock, Layers, Loader2, Pencil, Play, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAddSegments,
  useDeleteEpisode,
  useDeleteSegment,
  useEpisode,
  useMergeEpisode,
  useMoveSegment,
  useRenderQueue,
  useRetakeSegment,
  useUpdateSegmentText,
  type EpisodeDetail,
} from '@/hooks/use-episodes';
import { EpisodeDialog } from '@/components/projects/episode-dialog';
import { ScriptComposer } from '@/components/projects/script-composer';
import { SegmentRow } from '@/components/projects/segment-row';
import { MergePanel } from '@/components/projects/merge-panel';
import { VoiceControls } from '@/components/generation/voice-controls';
import { GenerationProgress } from '@/components/generation/generation-progress';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DEFAULT_MODEL_ID } from '@/lib/models';
import { formatDuration } from '@/lib/utils';
import { episodeKindLabel } from '@/lib/projects';
import { Badge } from '@/components/ui/badge';
import type { RenderSettings } from '@/lib/validations';

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
      <div className="space-y-6">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-72 rounded-2xl lg:col-span-7" />
          <Skeleton className="h-72 rounded-2xl lg:col-span-5" />
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

  const addSegments = useAddSegments(episode.id);
  const retake = useRetakeSegment(episode.id);
  const updateText = useUpdateSegmentText(episode.id);
  const moveSegment = useMoveSegment(episode.id);
  const deleteSegment = useDeleteSegment(episode.id);
  const merge = useMergeEpisode(episode.id);
  const deleteEpisode = useDeleteEpisode();
  const queue = useRenderQueue(episode.id);
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

  const segments = episode.segments;
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

  const handleDelete = () => {
    if (!confirm(`تمسح "${episode.title}" بكل مقاطعها؟ النسخة المصدّرة في مجلدك مش هتتمسح.`)) return;
    deleteEpisode.mutate(episode.id, { onSuccess: () => router.push(projectHref) });
  };

  return (
    <div className="space-y-8">
      <header className="space-y-4 border-b border-border pb-6">
        <nav aria-label="المسار" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            المشاريع
          </Link>
          <ChevronLeft className="h-3.5 w-3.5" />
          <Link href={projectHref} className="hover:text-foreground">
            {episode.project.title}
          </Link>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{episode.title}</h1>
              <Badge variant="accent">{episodeKindLabel(episode.kind)}</Badge>
            </div>
            {episode.description && (
              <p className="max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">{episode.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                <span className="numeric font-semibold text-foreground">{segments.length}</span> مقطع
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span className="numeric font-semibold text-foreground">{formatDuration(renderedSeconds)}</span>
                متولّد
              </span>
            </div>
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
        </div>
      </header>

      <Form {...form}>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <ScriptComposer isBusy={isBusy} isAdding={addSegments.isPending} onAdd={handleAdd} />

            {/* What is rendering now, and the way to stop between segments. */}
            {isRendering && (
              <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    {queue.state ? (
                      <span>
                        بيتولّد المقطع{' '}
                        <span className="numeric">
                          {segments.findIndex((s) => s.id === queue.state?.currentId) + 1}
                        </span>{' '}
                        — <span className="numeric">{queue.state.done}</span> من{' '}
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

            {!isRendering && unfinishedIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <span className="text-sm">
                  <span className="numeric font-bold">{unfinishedIds.length}</span> مقطع لسه ماتولّدش أو فشل
                </span>
                <Button size="sm" disabled={isBusy} onClick={() => void queue.start(unfinishedIds)}>
                  <Play className="h-3.5 w-3.5" />
                  ولّد الباقي
                </Button>
              </div>
            )}

            <section className="space-y-3">
              <h2 className="text-base font-bold tracking-tight">المقاطع بالترتيب</h2>
              {segments.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center text-sm text-muted-foreground">
                  لسه مفيش مقاطع. الصق السكريبت فوق — كل مقطع هيظهر هنا تسمعه وتعيده لوحده.
                </p>
              ) : (
                segments.map((segment, index) => (
                  <SegmentRow
                    key={segment.id}
                    segment={segment}
                    number={index + 1}
                    isFirst={index === 0}
                    isLast={index === segments.length - 1}
                    isRendering={renderingId === segment.id}
                    isBusy={isBusy}
                    onRetake={(text) => retake.mutate({ id: segment.id, text, settings: settings() })}
                    onSaveText={(text) => updateText.mutate({ id: segment.id, text })}
                    onMove={(direction) => moveSegment.mutate({ id: segment.id, direction })}
                    onDelete={() => deleteSegment.mutate(segment.id)}
                  />
                ))
              )}
            </section>
          </div>

          <aside className="space-y-6 lg:col-span-5">
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
          </aside>
        </div>
      </Form>
    </div>
  );
}
