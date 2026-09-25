'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronLeft, Clock, Layers, Pencil, Plus, Trash2, AudioLines } from 'lucide-react';
import { useDeleteProject, useProject, type ProjectDetail, type ProjectEpisode } from '@/hooks/use-projects';
import { ProjectDialog } from '@/components/projects/project-dialog';
import { EpisodeDialog } from '@/components/projects/episode-dialog';
import { AudioPlayer } from '@/components/generation/audio-player';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { episodeKindLabel, EPISODE_KINDS } from '@/lib/projects';
import { formatDate, formatDuration } from '@/lib/utils';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, error } = useProject(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error?.message ?? 'المشروع مش موجود'}</p>
        <Button asChild variant="outline">
          <Link href="/projects">رجوع للمشاريع</Link>
        </Button>
      </div>
    );
  }

  return <ProjectOverview project={project} />;
}

function ProjectOverview({ project }: { project: ProjectDetail }) {
  const router = useRouter();
  const deleteProject = useDeleteProject();
  const episodes = project.episodes;

  const counts = EPISODE_KINDS.map((kind) => ({
    ...kind,
    count: episodes.filter((e) => e.kind === kind.id).length,
  })).filter((k) => k.count > 0);
  const finishedSeconds = episodes.reduce((sum, e) => sum + (e.mergedDuration ?? 0), 0);

  const handleDelete = () => {
    const warning = episodes.length
      ? `تمسح مشروع "${project.title}" بكل حلقاته (${episodes.length})؟ النسخ المصدّرة في مجلداتك مش هتتمسح.`
      : `تمسح مشروع "${project.title}"؟`;
    if (!confirm(warning)) return;
    deleteProject.mutate(project.id, { onSuccess: () => router.push('/projects') });
  };

  const newEpisodeButton = (label: string) => (
    <EpisodeDialog projectId={project.id}>
      <Button>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
    </EpisodeDialog>
  );

  return (
    <div className="space-y-8">
      <header className="space-y-4 border-b border-border pb-6">
        <nav aria-label="المسار" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            المشاريع
          </Link>
          <ChevronLeft className="h-3.5 w-3.5" />
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{project.title}</h1>
            {project.description && (
              <p className="max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
              {counts.length === 0 ? (
                <span>لسه مفيش حلقات</span>
              ) : (
                counts.map((kind) => (
                  <span key={kind.id}>
                    <span className="numeric font-semibold text-foreground">{kind.count}</span> {kind.label}
                  </span>
                ))
              )}
              {finishedSeconds > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="numeric font-semibold text-foreground">{formatDuration(finishedSeconds)}</span>
                  مدموجة
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ProjectDialog project={project}>
              <Button variant="outline" size="sm">
                <Pencil className="h-3.5 w-3.5" />
                تعديل
              </Button>
            </ProjectDialog>
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteProject.isPending}
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              مسح
            </Button>
            {newEpisodeButton('حلقة جديدة')}
          </div>
        </div>
      </header>

      {episodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-card/40 px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <AudioLines className="h-6 w-6" />
          </span>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold">ابدأ أول حلقة</h3>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              كل حلقة أو شورت ليه السكريبت بتاعه والصوت بتاعه. هتولّده مقطع مقطع، تراجع كل مقطع لوحده،
              وبعدين تدمجهم في ملف واحد.
            </p>
          </div>
          {newEpisodeButton('أول حلقة')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {episodes.map((episode, i) => (
            <EpisodeCard key={episode.id} projectId={project.id} episode={episode} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function EpisodeCard({ projectId, episode, index }: { projectId: string; episode: ProjectEpisode; index: number }) {
  const href = `/projects/${projectId}/episodes/${episode.id}`;
  const pending = episode.segmentCount - episode.completedCount - episode.failedCount;

  return (
    <article
      className="animate-rise flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      {/* The title is the link, not the whole card: the card holds a player. */}
      <Link href={href} className="group min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Badge variant="accent" className="shrink-0">
            {episodeKindLabel(episode.kind)}
          </Badge>
          <h3 className="truncate text-base font-bold group-hover:text-primary">{episode.title}</h3>
        </div>
        <p className="line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">
          {episode.description || 'بدون وصف'}
        </p>
      </Link>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">
          <Layers />
          <span className="numeric">{episode.segmentCount}</span> مقطع
        </Badge>
        {episode.failedCount > 0 && (
          <Badge variant="destructive">
            <AlertTriangle />
            <span className="numeric">{episode.failedCount}</span> فشل
          </Badge>
        )}
        {pending > 0 && (
          <Badge variant="secondary">
            <span className="numeric">{pending}</span> في الانتظار
          </Badge>
        )}
        {episode.mergedAudioPath &&
          (episode.mergeIsCurrent ? (
            <Badge variant="success">
              <CheckCircle2 />
              جاهزة <span className="numeric">{formatDuration(episode.mergedDuration ?? 0)}</span>
            </Badge>
          ) : (
            <Badge variant="accent">اتغيّرت بعد الدمج</Badge>
          ))}
      </div>

      {episode.mergedAudioPath && <AudioPlayer src={`/api/audio/${episode.mergedAudioPath}`} compact />}

      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          آخر تعديل <span className="bidi-isolate">{formatDate(episode.updatedAt)}</span>
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={href}>افتح</Link>
        </Button>
      </div>
    </article>
  );
}
