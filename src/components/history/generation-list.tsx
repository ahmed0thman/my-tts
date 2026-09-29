'use client';

import { useState } from 'react';
import { useGenerations, useDeleteGeneration, useDeleteGenerations, useRetryGeneration } from '@/hooks/use-generations';
import { useVoiceProfiles } from '@/hooks/use-voice-profiles';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/providers/confirm-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { AudioPlayer } from '@/components/generation/audio-player';
import { cn, formatDate, normalizeStatus, STATUS_LABELS } from '@/lib/utils';
import { RefreshCw, Trash2, Download, SearchX, AlertTriangle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

const MODEL_LABELS: Record<string, string> = {
  silma: 'SILMA — فصحى',
  'namaa-saudi': 'NAMAA — سعودي',
  'namaa-egyptian': 'NAMAA — مصري',
  'masri-higgs': 'Masri Higgs — مصري',
  voicetut: 'VoiceTut — مصري',
  imported: 'صوت متضاف',
};

const PARAM_LABELS: Record<string, string> = {
  speed: 'السرعة',
  cfgStrength: 'الالتزام',
  nfeStep: 'الخطوات',
  exaggeration: 'التعبير',
  cfgWeight: 'الإيقاع',
  temperature: 'التنوّع',
  topK: 'الاحتمالات',
  guidanceScale: 'الالتزام',
  numStep: 'الخطوات',
  breathReduction: 'النفَس',
};

export function GenerationList() {
  const [page, setPage] = useState(1);
  const [voiceProfileId, setVoiceProfileId] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  // Ids, not rows, so a selection survives paging. It is cleared when a filter
  // changes, since the rows it named are no longer on screen to review.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

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
  const { mutate: deleteMany, isPending: isDeletingMany } = useDeleteGenerations();
  const confirm = useConfirm();
  const { mutate: retryGen, isPending: isRetrying } = useRetryGeneration();

  const handleDelete = async (id: string) => {
    if (await confirm({ title: 'تمسح التسجيل ده من السجل؟', confirmLabel: 'امسح', destructive: true })) {
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

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  const handleDeleteSelected = async () => {
    const ids = Array.from(selected);
    const ok = await confirm({
      title: `تمسح ${ids.length} تسجيل من السجل؟`,
      description: 'الملفات الصوتية هتتمسح كمان، ومش هينفع ترجعها.',
      confirmLabel: 'امسح',
      destructive: true,
    });
    if (!ok) return;
    deleteMany(ids, { onSuccess: clearSelection });
  };

  const handleExportSelected = async () => {
    const ids = Array.from(selected);
    setIsExporting(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          response.status === 404
            ? 'مفيش تسجيلات مكتملة في اللي اخترته'
            : response.status === 413
              ? 'الاختيار كبير قوي — قسّمه على أكتر من مرة'
              : (body?.error ?? 'حدث خطأ أثناء التصدير'),
        );
      }
      const url = window.URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `sawtak-clips-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('تم تجهيز الملف المضغوط');
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء التصدير');
    } finally {
      setIsExporting(false);
    }
  };

  const StatusBadge = ({ value }: { value: string }) => {
    const s = normalizeStatus(value);
    const variant =
      s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'destructive' : 'outline';
    return <Badge variant={variant as any}>{STATUS_LABELS[s]}</Badge>;
  };

  const totalPages = data?.totalPages ?? 1;
  const pageIds: string[] = data?.items?.map((g: any) => g.id) ?? [];
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

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
              clearSelection();
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
              clearSelection();
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

      {!!data?.items?.length && (
        <div
          className={cn(
            'sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-2.5 transition-colors',
            selected.size ? 'border-primary/40 shadow-sm' : 'border-border',
          )}
        >
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
            <Checkbox
              checked={allOnPageSelected ? true : selectedOnPage ? 'indeterminate' : false}
              onCheckedChange={(on) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const id of pageIds) {
                    if (on === true) next.add(id);
                    else next.delete(id);
                  }
                  return next;
                });
              }}
              aria-label="تحديد كل تسجيلات الصفحة"
            />
            {selected.size ? (
              <span>
                اتحدد <span className="numeric text-primary">{selected.size}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">تحديد الكل</span>
            )}
          </label>

          {selected.size > 0 && (
            <div className="ms-auto flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={handleExportSelected} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {selected.size > 1 ? 'تحميل (ZIP)' : 'تحميل'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={handleDeleteSelected}
                disabled={isDeletingMany}
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection} aria-label="إلغاء التحديد">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

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
            const isSelected = selected.has(gen.id);
            return (
              <article
                key={gen.id}
                className={cn(
                  'animate-rise flex flex-col gap-5 rounded-2xl border p-5 transition-colors lg:flex-row',
                  isSelected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-card hover:border-border-strong',
                )}
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              >
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(on) => toggle(gen.id, on === true)}
                        aria-label="تحديد التسجيل"
                      />
                      <StatusBadge value={gen.status} />
                    </div>
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
                    {gen.episode && (
                      <Link href={`/projects/${gen.episode.project.id}/episodes/${gen.episode.id}`}>
                        <Badge variant="accent" className="hover:bg-primary/20">
                          {gen.episode.project.title} ← {gen.episode.title}
                        </Badge>
                      </Link>
                    )}
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
