'use client';

import { useState } from 'react';
import { useGenerations, useDeleteGeneration, useRetryGeneration } from '@/hooks/use-generations';
import { useVoiceProfiles } from '@/hooks/use-voice-profiles';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AudioPlayer } from '@/components/generation/audio-player';
import { formatDate, normalizeStatus, STATUS_LABELS } from '@/lib/utils';
import { RefreshCw, Trash2, Download, SearchX, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const MODEL_LABELS: Record<string, string> = {
  silma: 'SILMA — فصحى',
  'namaa-saudi': 'NAMAA — سعودي',
  'namaa-egyptian': 'NAMAA — مصري',
  'masri-higgs': 'Masri Higgs — مصري',
};

const PARAM_LABELS: Record<string, string> = {
  speed: 'السرعة',
  cfgStrength: 'الالتزام',
  nfeStep: 'الخطوات',
  exaggeration: 'التعبير',
  cfgWeight: 'الإيقاع',
  temperature: 'التنوّع',
  topK: 'الاحتمالات',
};

export function GenerationList() {
  const [page, setPage] = useState(1);
  const [voiceProfileId, setVoiceProfileId] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  const { data, isLoading } = useGenerations({
    page,
    pageSize: 10,
    voiceProfileId: voiceProfileId !== 'all' ? voiceProfileId : undefined,
    // Prisma expects the uppercase enum member — sending 'completed' matched
    // nothing and silently returned an empty list.
    status: status !== 'all' ? status : undefined,
  });

  const { data: profiles } = useVoiceProfiles();
  const { mutate: deleteGen, isPending: isDeleting } = useDeleteGeneration();
  const { mutate: retryGen, isPending: isRetrying } = useRetryGeneration();

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا السجل؟')) {
      deleteGen(id, { onSuccess: () => toast.success('تم الحذف بنجاح') });
    }
  };

  const handleRetry = (id: string) => {
    retryGen(id, { onSuccess: () => toast.success('جاري إعادة المحاولة...') });
  };

  const handleDownload = async (path: string) => {
    try {
      const response = await fetch(`/api/audio/${path}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `generation-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('حدث خطأ أثناء التحميل');
    }
  };

  const StatusBadge = ({ value }: { value: string }) => {
    const s = normalizeStatus(value);
    const variant =
      s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'destructive' : 'outline';
    return <Badge variant={variant as any}>{STATUS_LABELS[s]}</Badge>;
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">الصوت</Label>
          <Select
            value={voiceProfileId}
            onValueChange={(val) => {
              setVoiceProfileId(val);
              setPage(1);
            }}
          >
            <SelectTrigger dir="rtl">
              <SelectValue placeholder="كل الأصوات" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل الأصوات</SelectItem>
              <SelectItem value="default">صوت افتراضي</SelectItem>
              {profiles?.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">الحالة</Label>
          <Select
            value={status}
            onValueChange={(val) => {
              setStatus(val);
              setPage(1);
            }}
          >
            <SelectTrigger dir="rtl">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="COMPLETED">مكتمل</SelectItem>
              <SelectItem value="PROCESSING">قيد المعالجة</SelectItem>
              <SelectItem value="PENDING">في الانتظار</SelectItem>
              <SelectItem value="FAILED">فشل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <Skeleton className="mb-4 h-4 w-24" />
              <Skeleton className="mb-2 h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : !data?.items?.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card/40 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold">مفيش نتائج بالفلاتر دي</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            جرّب توسّع الفلترة أو تولّد صوت جديد من صفحة الاستوديو.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((gen: any, i: number) => {
            const s = normalizeStatus(gen.status);
            return (
              <article
                key={gen.id}
                className="animate-rise flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border-strong lg:flex-row"
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              >
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge value={gen.status} />
                    <span className="bidi-isolate text-[11px] text-muted-foreground">
                      {formatDate(gen.createdAt)}
                    </span>
                  </div>

                  <p className="line-clamp-3 text-sm leading-relaxed" dir="rtl">
                    {gen.text}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      {MODEL_LABELS[gen.modelId] ?? gen.modelId}
                    </Badge>
                    <Badge variant="outline">
                      الصوت: {gen.voiceProfile?.name || 'افتراضي'}
                    </Badge>
                    {/* Parameter names differ per model, so render whatever was
                        recorded. Rows from before multi-model support fall back
                        to the legacy SILMA columns. */}
                    {Object.entries(
                      (gen.params as Record<string, number> | null) ?? {
                        speed: gen.speed,
                        cfgStrength: gen.cfgStrength,
                      },
                    ).map(([key, value]) => (
                      <Badge key={key} variant="outline">
                        {PARAM_LABELS[key] ?? key} <span className="numeric">{value}</span>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex w-full shrink-0 flex-col justify-center gap-3 lg:w-96">
                  {s === 'COMPLETED' && gen.audioPath ? (
                    <AudioPlayer src={`/api/audio/${gen.audioPath}`} compact />
                  ) : s === 'FAILED' ? (
                    <div
                      className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive"
                      title={gen.error}
                    >
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-2 leading-relaxed">
                        {gen.error || 'حدث خطأ غير معروف'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 p-5 text-xs text-muted-foreground">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      {STATUS_LABELS[s]}...
                    </div>
                  )}

                  <div className="flex justify-end gap-1.5">
                    {s === 'FAILED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(gen.id)}
                        disabled={isRetrying}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        إعادة
                      </Button>
                    )}
                    {s === 'COMPLETED' && gen.audioPath && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(gen.audioPath)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        تحميل
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(gen.id)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحة <span className="numeric font-semibold text-foreground">{page}</span> من{' '}
            <span className="numeric font-semibold text-foreground">{totalPages}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
