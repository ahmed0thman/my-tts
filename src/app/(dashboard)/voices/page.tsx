'use client';

import { useVoiceProfiles } from '@/hooks/use-voice-profiles';
import { VoiceCard } from '@/components/voices/voice-card';
import { UploadDialog } from '@/components/voices/upload-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Plus, Mic } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function VoicesPage() {
  const { data: profiles, isLoading } = useVoiceProfiles();

  return (
    <div className="space-y-8">
      <PageHeader
        title="الأصوات"
        description="ارفع أو سجّل عينة صوتية نظيفة، وخلي المحرك يستنسخها ويستخدمها في التوليد."
        action={
          <UploadDialog>
            <Button>
              <Plus className="h-4 w-4" />
              إضافة صوت جديد
            </Button>
          </UploadDialog>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex h-56 flex-col rounded-2xl border border-border bg-card p-5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <Skeleton className="mb-3 h-5 w-1/2" />
              <Skeleton className="mb-auto h-3 w-3/4" />
              <Skeleton className="mt-4 h-14 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : profiles?.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-card/40 px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Mic className="h-6 w-6" />
          </span>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold">لسه مفيش أصوات محفوظة</h3>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              ضيف عينة صوتية من ٣ لـ ٣٠ ثانية، والمحرك هيستنسخ نبرتها ويقدر يقرأ بيها أي نص
              مصري تكتبه.
            </p>
          </div>
          <UploadDialog>
            <Button>
              <Plus className="h-4 w-4" />
              إضافة أول صوت
            </Button>
          </UploadDialog>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {profiles?.map((profile: any, i: number) => (
            <div
              key={profile.id}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}
            >
              <VoiceCard profile={profile} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
