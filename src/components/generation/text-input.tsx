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

interface PersonaPreset {
  id: string;
  label: string;
  icon: any;
  text: string;
  speed: number;
  cfgStrength: number;
  nfeStep: number;
}

const EGYPTIAN_PERSONAS: PersonaPreset[] = [
  {
    id: "news",
    label: "مذيع إخباري",
    icon: Yoga01Icon,
    text: "نشرة الأخبار من القاهرة، أهلاً بكم وإليكم تفاصيل أهم الأنباء في مصر والمنطقة اليوم.",
    speed: 0.95,
    cfgStrength: 2.5,
    nfeStep: 24,
  },
  {
    id: "casual",
    label: "شاب قاهري",
    icon: Chatting01Icon,
    text: "يا مساء الجمال يا باشا! عامل إيه النهارده؟ قولي بقى الأخبار عندك إيه في الشغل؟",
    speed: 1.1,
    cfgStrength: 2.0,
    nfeStep: 16,
  },
  {
    id: "story",
    label: "سرد درامي",
    icon: FireIcon,
    text: "كانت شوارع المعز هادية تماماً في الليلة دي، ومحدش كان يعرف إن السر اللي استخبى سنين هينكشف أخيراً...",
    speed: 0.85,
    cfgStrength: 2.2,
    nfeStep: 24,
  },
  {
    id: "support",
    label: "خدمة عملاء",
    icon: AiVoice01Icon,
    text: "أهلاً بحضرتك يا فندم في خدمة العملاء، تشرفنا بمكالمتك وأنا تحت أمرك لمساعدتك في أي استفسار.",
    speed: 1.0,
    cfgStrength: 2.0,
    nfeStep: 16,
  },
  {
    id: "promo",
    label: "إعلان تجاري",
    icon: SparklesIcon,
    text: "استنى هنا! العرض اللي كنت بتدور عليه وصل النهاردة بخصومات ملهاش مثيل، متفوتش الفرصة واطلب دلوقتي!",
    speed: 1.2,
    cfgStrength: 1.8,
    nfeStep: 16,
  },
];

interface TextInputProps {
  isPending?: boolean;
  /** Batch mode generates one clip per non-empty line. */
  isBatchMode?: boolean;
  currentStageIndex?: number;
  stages?: string[];
}

export function TextInput({
  isPending = false,
  isBatchMode = false,
  currentStageIndex = 0,
  stages,
}: TextInputProps) {
  const { control, watch, setValue } = useFormContext();
  const text: string = watch("text") || "";
  const [copied, setCopied] = React.useState(false);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;
  // Egyptian Arabic speech cadence is approx 2.6 words per second (~155 words/min)
  const estimatedSeconds = Math.max(1, Math.round(words / 2.6));

  const handleApplyPersona = (persona: PersonaPreset) => {
    setValue("text", persona.text, { shouldValidate: true, shouldDirty: true });
    setValue("speed", persona.speed, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue("cfgStrength", persona.cfgStrength, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue("nfeStep", persona.nfeStep, { shouldValidate: true, shouldDirty: true });
    toast.success(`تم اختيار نبرة "${persona.label}"`);
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

                {/* Neural Progress Pipeline while generating */}
                {isPending && stages && (
                  <div className="border-t border-primary/20 bg-muted/60 p-3.5 text-xs">
                    <div className="flex items-center justify-between mb-2 font-medium">
                      <span className="flex items-center gap-1.5 text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{stages[currentStageIndex]}</span>
                      </span>
                      <span className="numeric text-[11px] text-muted-foreground">
                        {currentStageIndex + 1}/{stages.length}
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500"
                        style={{
                          width: `${((currentStageIndex + 1) / stages.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
