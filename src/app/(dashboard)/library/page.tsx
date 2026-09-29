'use client';

import { FileAudio, Library, Mic } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NewClipDialog } from '@/components/clips/new-clip-dialog';
import { LibraryClipCard } from '@/components/clips/library-clip-card';
import { useClips } from '@/hooks/use-clips';

/**
 * Clips saved to reuse across episodes: intros, sign-offs, recordings in the
 * user's own voice. Episodes take a copy through «إضافة صوت».
 */
export default function LibraryPage() {
  const { data: clips, isLoading } = useClips();

  return (
    <div className="space-y-8">
      <PageHeader
        title="مكتبة المقاطع"
        description="مقدمة أو ختام ثابت، أو تسجيل بصوتك — احفظه هنا مرة، وحطه في أي حلقة من «إضافة صوت»."
        action={
          <>
            <NewClipDialog initialTab="recording">
              <Button variant="outline">
                <Mic className="h-4 w-4" />
                سجّل
              </Button>
            </NewClipDialog>
            <NewClipDialog initialTab="upload">
              <Button>
                <FileAudio className="h-4 w-4" />
                ارفع ملف
              </Button>
            </NewClipDialog>
          </>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : !clips?.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Library className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold">المكتبة فاضية</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            ارفع ملف أو سجّل بصوتك من فوق. وتقدر كمان تحفظ أي مقطع متولّد من قايمة «⋯» على الكارت بتاعه في الحلقة.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clips.map((clip) => (
            <LibraryClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </div>
  );
}
