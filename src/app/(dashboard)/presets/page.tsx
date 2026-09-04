'use client';

import { useState } from 'react';
import { usePresets, useCreatePreset, useDeletePreset } from '@/hooks/use-presets';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Settings2, Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';

const RECOMMENDED_PRESETS = [
  { name: 'متمهل', description: 'إلقاء بطيء وواضح', speed: 0.85, cfgStrength: 2.0, nfeStep: 16 },
  { name: 'محايد', description: 'الإعدادات الافتراضية', speed: 1.0, cfgStrength: 2.0, nfeStep: 16 },
  { name: 'سريع', description: 'قراءة سريعة للنصوص الطويلة', speed: 1.25, cfgStrength: 2.0, nfeStep: 16 },
  { name: 'مطابق للعينة', description: 'التزام أعلى بنبرة الصوت المرجعي', speed: 1.0, cfgStrength: 3.0, nfeStep: 24 },
  { name: 'جودة عالية', description: 'أنقى صوت، وقت توليد أطول', speed: 1.0, cfgStrength: 2.0, nfeStep: 32 },
];

/** Small paired readout used on every preset tile. */
function ParamPair({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric font-bold text-foreground">{value.toFixed(2)}</span>
    </div>
  );
}

export default function PresetsPage() {
  const { data: presets, isLoading } = usePresets();
  const { mutate: createPreset, isPending: isCreating } = useCreatePreset();
  const { mutate: deletePreset } = useDeletePreset();

  const [isOpen, setIsOpen] = useState(false);
  const [newPreset, setNewPreset] = useState({
    name: '',
    description: '',
    speed: 1.0,
    cfgStrength: 2.0,
    nfeStep: 16,
  });

  const savedNames = new Set((presets ?? []).map((p: any) => p.name));

  const handleCreate = () => {
    if (!newPreset.name.trim()) {
      toast.error('يرجى إدخال اسم الإعداد');
      return;
    }
    createPreset(newPreset, {
      onSuccess: () => {
        toast.success('تم الحفظ بنجاح');
        setIsOpen(false);
        setNewPreset({ name: '', description: '', speed: 1.0, cfgStrength: 2.0, nfeStep: 16 });
      },
    });
  };

  const handleAddRecommended = (preset: any) => {
    createPreset(preset, {
      onSuccess: () => toast.success(`تم إضافة إعداد "${preset.name}" بنجاح`),
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الإعداد؟')) {
      deletePreset(id, { onSuccess: () => toast.success('تم الحذف بنجاح') });
    }
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title="الإعدادات المسبقة"
        description="احفظ تركيبات التعبير والإيقاع اللي بتستخدمها كتير، وطبّقها بضغطة واحدة من الاستوديو."
        action={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                إضافة إعداد
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة إعداد مسبق جديد</DialogTitle>
                <DialogDescription>
                  اضبط التعبير والإيقاع، واحفظهم باسم تقدر تلاقيه بسرعة بعدين.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="preset-name">الاسم</Label>
                  <Input
                    id="preset-name"
                    value={newPreset.name}
                    onChange={(e) => setNewPreset((p) => ({ ...p, name: e.target.value }))}
                    placeholder="مثال: صوت هادئ وسريع"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preset-desc">الوصف (اختياري)</Label>
                  <Input
                    id="preset-desc"
                    value={newPreset.description}
                    onChange={(e) => setNewPreset((p) => ({ ...p, description: e.target.value }))}
                    placeholder="وصف مختصر..."
                  />
                </div>

                <div className="space-y-5 rounded-xl border border-border bg-muted/40 p-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label>سرعة الإلقاء (Speed)</Label>
                      <span className="numeric text-sm font-bold text-primary">
                        {newPreset.speed.toFixed(2)}x
                      </span>
                    </div>
                    <Slider
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={[newPreset.speed]}
                      onValueChange={(v) => setNewPreset((p) => ({ ...p, speed: v[0] }))}
                      aria-label="سرعة الإلقاء"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label>الالتزام بالعينة (CFG Strength)</Label>
                      <span className="numeric text-sm font-bold text-primary">
                        {newPreset.cfgStrength.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      min={1}
                      max={4}
                      step={0.1}
                      value={[newPreset.cfgStrength]}
                      onValueChange={(v) => setNewPreset((p) => ({ ...p, cfgStrength: v[0] }))}
                      aria-label="الالتزام بالعينة"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label>خطوات التوليد (NFE Steps)</Label>
                      <span className="numeric text-sm font-bold text-primary">
                        {newPreset.nfeStep}
                      </span>
                    </div>
                    <Slider
                      min={8}
                      max={32}
                      step={4}
                      value={[newPreset.nfeStep]}
                      onValueChange={(v) => setNewPreset((p) => ({ ...p, nfeStep: v[0] }))}
                      aria-label="خطوات التوليد"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsOpen(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleCreate} disabled={isCreating || !newPreset.name.trim()}>
                  {isCreating ? 'جاري الحفظ...' : 'حفظ الإعداد'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Saved */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold tracking-tight">إعداداتي المحفوظة</h2>
          {!isLoading && (
            <span className="numeric rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {presets?.length ?? 0}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : presets?.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-card/40 px-6 py-12 text-center">
            <p className="text-sm font-bold">لسه مفيش إعدادات محفوظة</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              ابدأ بإعداد جديد، أو ضيف واحد من الاقتراحات الجاهزة تحت.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {presets?.map((preset: any, i: number) => (
              <article
                key={preset.id}
                className="animate-rise flex flex-col rounded-2xl border border-border bg-card shadow-plate"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <div className="space-y-1 p-5 pb-3">
                  <h3 className="truncate font-bold tracking-tight">{preset.name}</h3>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {preset.description || 'بدون وصف'}
                  </p>
                </div>

                <div className="mt-auto space-y-2 border-t border-border bg-muted/30 px-5 py-3">
                  <ParamPair label="سرعة الإلقاء" value={preset.speed} />
                  <ParamPair label="الالتزام بالعينة" value={preset.cfgStrength} />
                  {preset.voiceProfileId && (
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">الصوت</span>
                      <Badge variant="outline" className="max-w-32 truncate">
                        {preset.voiceProfile?.name || 'مخصص'}
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="border-t border-border p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(preset.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف الإعداد
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Recommended */}
      <section className="space-y-4 border-t border-border pt-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold tracking-tight">إعدادات مقترحة</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            نقط بداية مضبوطة على العامية المصرية — ضيفها لمكتبتك وعدّلها زي ما تحب.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {RECOMMENDED_PRESETS.map((preset) => {
            const alreadySaved = savedNames.has(preset.name);
            return (
              <article
                key={preset.name}
                className="flex flex-col rounded-2xl border border-dashed border-border-strong bg-card/40 p-5"
              >
                <div className="space-y-1">
                  <h3 className="font-bold tracking-tight">{preset.name}</h3>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                </div>

                <div className="my-4 space-y-2">
                  <ParamPair label="سرعة الإلقاء" value={preset.speed} />
                  <ParamPair label="الالتزام بالعينة" value={preset.cfgStrength} />
                </div>

                <Button
                  variant={alreadySaved ? 'ghost' : 'outline'}
                  size="sm"
                  className="mt-auto w-full"
                  disabled={alreadySaved || isCreating}
                  onClick={() => handleAddRecommended(preset)}
                >
                  {alreadySaved ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      مضاف بالفعل
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      إضافة للمكتبة
                    </>
                  )}
                </Button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
