'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePresets, useCreatePreset, useDeletePreset } from '@/hooks/use-presets';
import { useModels, defaultParamsFor } from '@/hooks/use-models';
import { PageHeader } from '@/components/layout/page-header';
import { ParamSliders } from '@/components/generation/param-sliders';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Settings2, Sparkles, Check, Cpu } from 'lucide-react';
import { paramsForTone, modelSupportsTone, type Tone } from '@/lib/tone-axes';
import type { TtsModel } from '@/lib/tts-client';
import { toast } from 'sonner';

/** The studio remembers the last model here; start from the same one. */
const MODEL_STORAGE_KEY = 'namaa:model-id';

/**
 * Suggestions are described on shared tone axes rather than one model's knobs,
 * so the same five work for every engine. Each is resolved against the selected
 * model's own ranges, and any whose axes that model cannot express is hidden —
 * "جودة عالية" is meaningless for a model with no fidelity knob.
 */
const RECOMMENDED_TONES: { name: string; description: string; tone: Tone }[] = [
  { name: 'متمهل', description: 'إلقاء بطيء وواضح', tone: { pace: 0.25, expressiveness: 0.35 } },
  { name: 'محايد', description: 'توازن طبيعي بين السرعة والتعبير', tone: { pace: 0.5, expressiveness: 0.5 } },
  { name: 'سريع', description: 'قراءة سريعة للنصوص الطويلة', tone: { pace: 0.8, expressiveness: 0.45 } },
  { name: 'معبّر', description: 'نبرة حماسية بتنوّع أوسع', tone: { pace: 0.6, expressiveness: 0.85 } },
  { name: 'مطابق للعينة', description: 'التزام أعلى بنبرة الصوت المرجعي', tone: { fidelity: 0.85 } },
  { name: 'جودة عالية', description: 'أنقى صوت، وقت توليد أطول', tone: { fidelity: 1 } },
];

/** Small paired readout used on every preset tile. */
function ParamPair({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric font-bold text-foreground">{value}</span>
    </div>
  );
}

export default function PresetsPage() {
  const { data: presets, isLoading } = usePresets();
  const { data: modelsData, isLoading: isLoadingModels } = useModels();
  const { mutate: createPreset, isPending: isCreating } = useCreatePreset();
  const { mutate: deletePreset } = useDeletePreset();

  const models = useMemo(() => modelsData?.models ?? [], [modelsData]);
  const [modelId, setModelId] = useState<string>('silma');
  const activeModel = models.find((m) => m.id === modelId);

  const [isOpen, setIsOpen] = useState(false);
  const [newPreset, setNewPreset] = useState({ name: '', description: '' });
  const [draftParams, setDraftParams] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved) setModelId(saved);
    } catch {
      // storage can be unavailable; the default model still works
    }
  }, []);

  // Parameter names do not transfer between models, so the draft resets to the
  // newly selected model's declared defaults instead of carrying stale keys.
  useEffect(() => {
    setDraftParams(defaultParamsFor(activeModel));
  }, [activeModel]);

  /** key → Arabic label, across every model, for rendering saved presets. */
  const paramLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const model of models) {
      for (const spec of model.params) labels[spec.key] = spec.label;
    }
    return labels;
  }, [models]);

  const modelLabel = (id: string) => models.find((m) => m.id === id)?.label ?? id;

  // A preset name is unique per model, so the same name may exist for another.
  const savedForModel = new Set(
    (presets ?? []).filter((p: any) => (p.modelId ?? 'silma') === modelId).map((p: any) => p.name),
  );

  const applicableTones = RECOMMENDED_TONES.filter((preset) =>
    modelSupportsTone(activeModel, preset.tone),
  );

  const handleCreate = () => {
    if (!newPreset.name.trim()) {
      toast.error('يرجى إدخال اسم الإعداد');
      return;
    }
    createPreset(
      { name: newPreset.name.trim(), description: newPreset.description, modelId, params: draftParams },
      {
        onSuccess: () => {
          toast.success('تم الحفظ بنجاح');
          setIsOpen(false);
          setNewPreset({ name: '', description: '' });
          setDraftParams(defaultParamsFor(activeModel));
        },
      },
    );
  };

  const handleAddRecommended = (preset: { name: string; description: string; tone: Tone }) => {
    createPreset(
      {
        name: preset.name,
        description: preset.description,
        modelId,
        params: paramsForTone(activeModel, preset.tone),
      },
      { onSuccess: () => toast.success(`تم إضافة إعداد "${preset.name}" لـ ${modelLabel(modelId)}`) },
    );
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الإعداد؟')) {
      deletePreset(id);
    }
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title="الإعدادات المسبقة"
        description="احفظ تركيبات الإلقاء اللي بتستخدمها كتير، وطبّقها بضغطة واحدة من الاستوديو. كل إعداد مرتبط بنموذجه — القيم مش بتنتقل بين النماذج."
        action={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button disabled={!activeModel}>
                <Plus className="h-4 w-4" />
                إضافة إعداد
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة إعداد مسبق جديد</DialogTitle>
                <DialogDescription>
                  اضبط معاملات النموذج، واحفظهم باسم تقدر تلاقيه بسرعة بعدين.
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

                {/* Sliders are rendered from the selected model's own schema. */}
                <div className="space-y-5 rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs">معاملات {activeModel?.label ?? modelId}</Label>
                    <Badge variant="outline" className="text-[10px]">{activeModel?.dialect}</Badge>
                  </div>
                  <ParamSliders model={activeModel} values={draftParams} onChange={setDraftParams} />
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

      {/* Model scope */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-plate">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="rounded-md bg-primary/10 p-1 text-primary">
            <Cpu className="h-4 w-4" />
          </span>
          النموذج
        </span>
        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger dir="rtl" className="h-10 w-64">
            <SelectValue placeholder="اختر النموذج" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {models.map((model: TtsModel) => (
              <SelectItem key={model.id} value={model.id} className="cursor-pointer">
                <div className="text-right">
                  <p className="text-sm font-bold">{model.label}</p>
                  <p className="text-[11px] text-muted-foreground">{model.dialect}</p>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          الإضافة والاقتراحات بتتحفظ للنموذج ده. الاستوديو بيعرض إعدادات النموذج المختار بس.
        </p>
      </section>

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
            {presets?.map((preset: any, i: number) => {
              const params = (preset.params as Record<string, number> | null) ?? {};
              const entries = Object.entries(params);

              return (
                <article
                  key={preset.id}
                  className="animate-rise flex flex-col rounded-2xl border border-border bg-card shadow-plate"
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                >
                  <div className="space-y-1.5 p-5 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-bold tracking-tight">{preset.name}</h3>
                      <Badge variant="outline" className="shrink-0 border-primary/30 text-[10px] text-primary">
                        {modelLabel(preset.modelId ?? 'silma')}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {preset.description || 'بدون وصف'}
                    </p>
                  </div>

                  <div className="mt-auto space-y-2 border-t border-border bg-muted/30 px-5 py-3">
                    {entries.length > 0 ? (
                      entries.map(([key, value]) => (
                        <ParamPair key={key} label={paramLabels[key] ?? key} value={value} />
                      ))
                    ) : (
                      // Presets saved before parameters became model-scoped kept
                      // their values in the legacy columns.
                      <>
                        <ParamPair label="سرعة الإلقاء" value={preset.speed} />
                        <ParamPair label="الالتزام بالعينة" value={preset.cfgStrength} />
                      </>
                    )}
                    {preset.voiceProfileId && (
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">الصوت</span>
                        <Badge variant="outline" className="max-w-32 truncate">مخصص</Badge>
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
              );
            })}
          </div>
        )}
      </section>

      {/* Recommended */}
      <section className="space-y-4 border-t border-border pt-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold tracking-tight">
              إعدادات مقترحة لـ {activeModel?.label ?? '...'}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            نقط بداية بتتحسب من مدى كل معامل في النموذج نفسه — ضيفها لمكتبتك وعدّلها زي ما تحب.
          </p>
        </div>

        {isLoadingModels ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {applicableTones.map((preset) => {
              const alreadySaved = savedForModel.has(preset.name);
              const resolved = paramsForTone(activeModel, preset.tone);

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
                    {Object.entries(resolved).map(([key, value]) => (
                      <ParamPair key={key} label={paramLabels[key] ?? key} value={value} />
                    ))}
                  </div>

                  <Button
                    variant={alreadySaved ? 'ghost' : 'outline'}
                    size="sm"
                    className="mt-auto w-full"
                    disabled={alreadySaved || isCreating || !activeModel}
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
        )}
      </section>
    </div>
  );
}
