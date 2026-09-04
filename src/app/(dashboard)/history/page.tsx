'use client';

import { GenerationList } from '@/components/history/generation-list';
import { useGenerationStats } from '@/hooks/use-generations';
import { PageHeader } from '@/components/layout/page-header';
import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function HistoryPage() {
  const { data: stats, isLoading } = useGenerationStats();

  const metrics = [
    { label: 'إجمالي العمليات', value: stats?.total ?? 0, icon: Activity, tone: 'text-foreground' },
    { label: 'مكتملة بنجاح', value: stats?.completed ?? 0, icon: CheckCircle, tone: 'text-success' },
    { label: 'فشلت', value: stats?.failed ?? 0, icon: XCircle, tone: 'text-destructive' },
    {
      label: 'إجمالي المدة',
      value: formatDuration(stats?.totalDuration ?? 0),
      icon: Clock,
      tone: 'text-primary',
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="سجل المعالجة"
        description="تتبع وإدارة جميع عمليات توليد الصوت السابقة."
      />

      {/* A single divided panel rather than four identical boxes — the numbers
          read as one instrument cluster instead of four unrelated cards. */}
      <div className="grid grid-cols-2 divide-border overflow-hidden rounded-2xl border border-border bg-card sm:divide-x-reverse lg:grid-cols-4 lg:divide-x lg:divide-x-reverse">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex flex-col gap-2 border-border p-5 max-lg:odd:border-e max-lg:[&:nth-child(-n+2)]:border-b">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Icon className={cn('h-3.5 w-3.5', tone)} />
              <span className="truncate">{label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className={cn('numeric text-2xl font-extrabold tracking-tight', tone)}>
                {value}
              </span>
            )}
          </div>
        ))}
      </div>

      <GenerationList />
    </div>
  );
}
