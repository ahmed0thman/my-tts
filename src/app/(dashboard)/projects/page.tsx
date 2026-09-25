'use client';

import Link from 'next/link';
import { FolderKanban, Plus, Layers, CheckCircle2, AudioLines } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { ProjectDialog } from '@/components/projects/project-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();

  const newProjectButton = (label: string) => (
    <ProjectDialog>
      <Button>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
    </ProjectDialog>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="المشاريع"
        description="المشروع قناة أو سلسلة. جوّاه حلقات وشورتس — كل واحدة بتتكتب وتتولّد مقطع مقطع، وتتراجع، وتندمج في ملف واحد."
        action={newProjectButton('مشروع جديد')}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-44 flex-col rounded-2xl border border-border bg-card p-5">
              <Skeleton className="mb-3 h-5 w-1/2" />
              <Skeleton className="mb-auto h-3 w-3/4" />
              <Skeleton className="mt-4 h-8 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : !projects?.length ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-card/40 px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FolderKanban className="h-6 w-6" />
          </span>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold">لسه مفيش مشاريع</h3>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              اعمل مشروع لكل قناة أو سلسلة أو عميل، وجوّاه ضيف الحلقات والشورتس. كل حلقة بتلصق
              السكريبت بتاعها، وكل سطر بيبقى مقطع تسمعه وتعيده لوحده قبل ما تدمجها.
            </p>
          </div>
          {newProjectButton('أول مشروع')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project, i) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="animate-rise group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}
            >
              <div className="min-w-0 space-y-1.5">
                <h3 className="truncate text-base font-bold group-hover:text-primary">{project.title}</h3>
                <p className="line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">
                  {project.description || 'بدون وصف'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">
                  <AudioLines />
                  <span className="numeric">{project.episodeCount}</span> حلقة
                </Badge>
                {project.segmentCount > 0 && (
                  <Badge variant="outline">
                    <Layers />
                    <span className="numeric">{project.segmentCount}</span> مقطع
                  </Badge>
                )}
                {project.mergedCount > 0 && (
                  <Badge variant="success">
                    <CheckCircle2 />
                    <span className="numeric">{project.mergedCount}</span> جاهزة
                  </Badge>
                )}
              </div>

              <span className="mt-auto text-[11px] text-muted-foreground">
                آخر نشاط <span className="bidi-isolate">{formatDate(project.lastActivity)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
