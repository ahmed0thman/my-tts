'use client';

import Link from 'next/link';
import { Clapperboard, Film, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NewDubDialog } from '@/components/dubbing/new-dub-dialog';
import { useDubs, type DubSummary } from '@/hooks/use-dubs';
import { languageLabel } from '@/lib/dubbing';
import { formatDate, formatDuration } from '@/lib/utils';

/**
 * Videos getting a new voice. Each one: upload → transcribe → (paste a
 * translation) → generate line by line → replace the video's audio.
 */
export default function DubbingPage() {
  const { data: dubs, isLoading } = useDubs();

  return (
    <div className="space-y-8">
      <PageHeader
        title="الدبلجة"
        description="فيديو جاهز بصوته — نفرّغ كلامه بتوقيته، تولّده بصوت من أصواتك (بنفس اللغة أو بترجمتك)، ونركّبه مكان الصوت الأصلي بنفس طول الفيديو."
        action={
          <NewDubDialog>
            <Button>
              <Plus className="h-4 w-4" />
              دبلجة جديدة
            </Button>
          </NewDubDialog>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : !dubs?.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Clapperboard className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold">لسه مفيش دبلجة</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            ارفع فيديو من «دبلجة جديدة». الكلام اللي فيه هيتفرّغ سطر سطر بتوقيته، وكل سطر يتولّد على قد مكانه.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dubs.map((dub) => (
            <DubCard key={dub.id} dub={dub} />
          ))}
        </div>
      )}
    </div>
  );
}

function DubCard({ dub }: { dub: DubSummary }) {
  const status = dub.outputVideoPath
    ? { label: 'متركّب', variant: 'success' as const }
    : !dub.transcribedAt
      ? { label: 'لسه ماتفرّغش', variant: 'secondary' as const }
      : { label: `${dub.doneCount}/${dub.lineCount} سطر جاهز`, variant: 'accent' as const };

  return (
    <Link
      href={`/dubbing/${dub.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-border-strong"
    >
      <div className="relative aspect-video bg-muted">
        {dub.posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/audio/${dub.posterPath}`} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center">
            <Film className="h-8 w-8 text-muted-foreground" />
          </span>
        )}
        <span className="numeric absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {formatDuration(dub.duration)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="truncate text-sm font-bold group-hover:text-primary" dir="auto">
          {dub.title}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={status.variant}>{status.label}</Badge>
          {dub.language && <Badge variant="outline">من {languageLabel(dub.language)}</Badge>}
        </div>
        <p className="mt-auto text-[11px] text-muted-foreground">
          آخر تعديل <span className="bidi-isolate">{formatDate(dub.updatedAt)}</span>
        </p>
      </div>
    </Link>
  );
}
