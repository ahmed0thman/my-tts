"use client";

import React from "react";
import { useFormContext } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Copy,
  Check,
  Sparkles,
  AlignLeft,
  Clock,
  Loader2,
} from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiVoice01Icon,
  Chatting01Icon,
  SparklesIcon,
  FireIcon,
  Yoga01Icon,
  VolumeHighIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { useModels } from "@/hooks/use-models";
import { GenerationProgress } from "./generation-progress";
import { paramsForTone, type Tone } from "@/lib/tone-axes";

interface PersonaPreset {
  id: string;
  label: string;
  icon: any;
  text: string;
  /**
   * Expressed on shared semantic axes, not on one model's knobs. The chips used
   * to set `speed`/`cfgStrength`/`nfeStep` directly, which stopped doing
   * anything once parameters moved into the per-model `params` blob.
   */
  tone: Tone;
}

const EGYPTIAN_PERSONAS: PersonaPreset[] = [
  {
    id: "news",
    label: "مذيع إخباري",
    icon: Yoga01Icon,
    text: "نشرة الأخبار من القاهرة، أهلاً بكم وإليكم تفاصيل أهم الأنباء في مصر والمنطقة اليوم.",
    tone: { pace: 0.42, expressiveness: 0.3, fidelity: 0.65 },
  },
  {
    id: "casual",
    label: "شاب قاهري",
    icon: Chatting01Icon,
    text: "يا مساء الجمال يا باشا! عامل إيه النهارده؟ قولي بقى الأخبار عندك إيه في الشغل؟",
    tone: { pace: 0.62, expressiveness: 0.6, fidelity: 0.35 },
  },
  {
    id: "story",
    label: "سرد درامي",
    icon: FireIcon,
    text: "كانت شوارع المعز هادية تماماً في الليلة دي، ومحدش كان يعرف إن السر اللي استخبى سنين هينكشف أخيراً...",
    tone: { pace: 0.28, expressiveness: 0.75, fidelity: 0.6 },
  },
  {
    id: "support",
    label: "خدمة عملاء",
    icon: AiVoice01Icon,
    text: "أهلاً بحضرتك يا فندم في خدمة العملاء، تشرفنا بمكالمتك وأنا تحت أمرك لمساعدتك في أي استفسار.",
    tone: { pace: 0.5, expressiveness: 0.4, fidelity: 0.4 },
  },
  {
    id: "promo",
    label: "إعلان تجاري",
    icon: SparklesIcon,
    text: "استنى هنا! العرض اللي كنت بتدور عليه وصل النهاردة بخصومات ملهاش مثيل، متفوتش الفرصة واطلب دلوقتي!",
    tone: { pace: 0.78, expressiveness: 0.85, fidelity: 0.3 },
  },
];

interface TextInputProps {
  isPending?: boolean;
  /** Batch mode generates one clip per non-empty line. */
  isBatchMode?: boolean;
}

export function TextInput({
  isPending = false,
  isBatchMode = false,
}: TextInputProps) {
  const { control, watch, setValue } = useFormContext();
  const text: string = watch("text") || "";
  const [copied, setCopied] = React.useState(false);

  // The chip has to know which model is selected to translate its tone into
  // that model's own parameters.
  const modelId: string = watch("modelId") || "silma";
  const { data: modelsData } = useModels();
  const activeModel = modelsData?.models.find((m) => m.id === modelId);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;
  // Egyptian Arabic speech cadence is approx 2.6 words per second (~155 words/min)
  const estimatedSeconds = Math.max(1, Math.round(words / 2.6));

  const handleApplyPersona = (persona: PersonaPreset) => {
    setValue("text", persona.text, { shouldValidate: true, shouldDirty: true });

    if (activeModel) {
      setValue("params", paramsForTone(activeModel, persona.tone), {
        shouldValidate: true,
        shouldDirty: true,
      });
      toast.success(`تم اختيار نبرة "${persona.label}"`, {
        description: `اتظبطت على ${activeModel.label}`,
      });
    } else {
      // Model list still loading — the text is in, the knobs stay as they are.
      toast.success(`تم إدخال نص "${persona.label}"`);
    }
  };

  const handleClear = () => {
    setValue("text", "", { shouldValidate: true, shouldDirty: true });
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("تم نسخ النص");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("فشل في نسخ النص");
    }
  };

  return (
    <div id="tour-text-input" className="flex flex-col h-full space-y-3">
      {/* Persona Presets Ribbon */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-bold text-foreground">
              نصوص ونبرات مصرية جاهزة:
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground/80 hidden sm:inline">
            اضغط لتعبئة النص وضبط المشاعر فوراً
          </span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {EGYPTIAN_PERSONAS.map((persona) => {
            const IconComp = persona.icon;
            return (
              <button
                key={persona.id}
                type="button"
                onClick={() => handleApplyPersona(persona)}
                className="group inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold transition-colors duration-150 hover:border-primary/50 hover:bg-primary/10 active:scale-95"
              >
                <HugeiconsIcon
                  icon={IconComp}
                  size={14}
                  className="text-primary"
                />
                <span className="text-foreground transition-colors group-hover:text-primary">
                  {persona.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Prompt Canvas */}
      <FormField
        control={control}
        name="text"
        render={({ field }) => (
          <FormItem className="w-full flex-1 flex flex-col space-y-0">
            <FormControl className="flex-1 flex flex-col">
              <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-plate transition-colors duration-150 focus-within:border-primary">
                {/* Textarea Workspace */}
                <div className="flex-1 p-4 sm:p-5 min-h-[180px] flex flex-col overflow-y-auto">
                  <Textarea
                    {...field}
                    dir="rtl"
                    placeholder={
                      isBatchMode
                        ? "وضع الدفعات: اكتب كل جملة في سطر لوحدها — كل سطر هيتولّد كملف صوتي منفصل."
                        : "اكتب النص بالعامية المصرية هنا، أو اختر إحدى النبرات الجاهزة بالأعلى..."
                    }
                    style={{ fieldSizing: "content" }}
                    className="field-sizing-content max-h-20 grow w-full min-h-37.5 overflow-y-auto text-base sm:text-lg border-0 p-0 focus-visible:ring-0 shadow-none leading-relaxed placeholder:text-muted-foreground/50 resize-none bg-transparent"
                  />
                </div>

                {/* Static Bottom Studio Dock (Flex Footer - Never overlaps text) */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3 text-xs">
                  {/* Right side in RTL: Live Word Metrics & Quick Utilities */}
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <AlignLeft className="h-3.5 w-3.5" />
                      {isBatchMode ? (
                        <>
                          <strong className="numeric font-bold text-foreground">
                            {lines}
                          </strong>
                          مقطع
                        </>
                      ) : (
                        <>
                          <strong className="numeric font-bold text-foreground">
                            {words}
                          </strong>
                          كلمة
                        </>
                      )}
                    </span>

                    {words > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                        <Clock className="h-3 w-3" />
                        <span>
                          ~<span className="numeric">{estimatedSeconds}</span>{" "}
                          ثانية
                        </span>
                      </span>
                    )}

                    {text.length > 0 && (
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleCopy}
                          className="h-7 w-7 rounded-lg"
                          title="نسخ النص"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleClear}
                          className="h-7 w-7 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                          title="مسح النص"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                    <span
                      className={`numeric hidden text-[11px] sm:inline ${text.length > 4500 ? "font-bold text-destructive" : "text-muted-foreground/70"}`}
                    >
                      {text.length}/5000
                    </span>
                  </div>

                  {/* Left side in RTL: Primary Studio Generate Button */}
                  <div className="flex items-center gap-2">
                    <Button
                      id="tour-generate-button"
                      type="submit"
                      size="lg"
                      className="h-11 rounded-xl px-6 text-sm"
                      disabled={isPending || !text.trim()}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>جاري التوليد...</span>
                        </>
                      ) : (
                        <>
                          <HugeiconsIcon icon={VolumeHighIcon} size={18} />
                          <span>
                            {isBatchMode && lines > 1
                              ? `توليد ${lines} مقاطع`
                              : "توليد الصوت"}
                          </span>
                          <kbd
                            className="hidden items-center rounded-md border border-current/25 bg-current/10 px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex"
                            dir="ltr"
                          >
                            &#8984;&#8629;
                          </kbd>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Live engine progress, polled from GET /api/progress */}
                <GenerationProgress isPending={isPending} />

              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
