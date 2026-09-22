'use client';

import { useEngineStatus } from '@/hooks/use-engine-status';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { Server, Settings2, HardDrive, Cpu, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'نهاري' },
  { value: 'dark', label: 'ليلي' },
  { value: 'system', label: 'تلقائي' },
] as const;

/** Label + LTR-isolated technical value, on one aligned row. */
function SpecRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="numeric truncate rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold">
        {value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: engineData, isLoading, refetch } = useEngineStatus();

  const [engineUrl, setEngineUrl] = useState('http://localhost:8000');

  // `theme` is undefined during SSR, so rendering the selected state before
  // mount produced a hydration mismatch on these buttons.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('engine_url');
      if (savedUrl) setEngineUrl(savedUrl);
    } catch {
      /* storage can be unavailable — fall back to the default URL */
    }
  }, []);

  const handleSaveUrl = () => {
    try {
      localStorage.setItem('engine_url', engineUrl);
      toast.success('تم حفظ رابط المحرك بنجاح');
      refetch();
    } catch {
      toast.error('تعذّر حفظ الرابط في هذا المتصفح');
    }
  };

  const isOnline = engineData?.isOnline ?? false;
  const sampleRate = (engineData as any)?.sample_rate;
  const modelName = (engineData as any)?.model_name;

  return (
    <div className="space-y-8">
      <PageHeader
        title="الإعدادات"
        description="إعدادات النظام والاتصال بمحرك توليد الصوت."
      />

      <div className="grid gap-6">
        {/* Engine connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              اتصال المحرك (TTS Engine)
            </CardTitle>
            <CardDescription>
              إعدادات الاتصال بالخادم المحلي لتوليد الصوت (Ahmed TTS Engine)
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="engine-url">رابط الخادم (URL)</Label>
              {/* Input and its action live on one row — the button used to
                  float unattached at the far edge of the card. */}
              <div className="flex gap-2">
                <Input
                  id="engine-url"
                  value={engineUrl}
                  onChange={(e) => setEngineUrl(e.target.value)}
                  dir="ltr"
                  className="font-mono text-sm"
                />
                <Button onClick={handleSaveUrl} className="shrink-0">
                  حفظ
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    isOnline ? 'bg-success' : 'bg-destructive',
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold">{isOnline ? 'متصل بنجاح' : 'غير متصل'}</p>
                  <p className="text-xs text-muted-foreground">
                    {isLoading
                      ? 'جاري التحقق...'
                      : isOnline
                        ? 'المحرك يعمل بشكل طبيعي'
                        : 'تأكد من تشغيل الخادم المحلي'}
                  </p>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                تحديث الحالة
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Model info */}
        {isOnline && engineData?.device && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                معلومات النموذج
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border py-0">
              <SpecRow label="الجهاز (Device)" value={String(engineData.device).toUpperCase()} />
              {modelName && <SpecRow label="النموذج (Model)" value={modelName} />}
              {/* `24000 Hz` must be one LTR run, otherwise the unit jumps to
                  the wrong side and reads "Hz 24000". */}
              {sampleRate && (
                <SpecRow label="معدل العينة (Sample Rate)" value={`${sampleRate} Hz`} />
              )}
            </CardContent>
          </Card>
        )}

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              المظهر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold">الوضع الليلي / النهاري</p>
                <p className="text-xs text-muted-foreground">تغيير مظهر واجهة المستخدم</p>
              </div>

              <div
                role="radiogroup"
                aria-label="المظهر"
                className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-muted p-1"
              >
                {THEME_OPTIONS.map((opt) => {
                  const selected = mounted && theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        'cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150',
                        selected
                          ? 'border border-border-strong bg-elevated text-primary shadow-plate'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              التخزين
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border py-0">
            <SpecRow label="مسار الأصوات المولدة" value="storage/audio/" />
            <SpecRow label="مسار عينات الصوت" value="storage/voice-samples/" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
