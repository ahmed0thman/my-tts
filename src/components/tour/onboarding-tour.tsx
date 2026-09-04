'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Compass,
  CheckCircle2,
  Play,
  Volume2,
  Sliders,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { TOUR_EVENT } from '@/lib/utils';

interface GuideStep {
  targetId: string;
  badge: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHandler?: () => void;
}

export function OnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const steps: GuideStep[] = [
    {
      targetId: 'tour-text-input',
      badge: 'الخطوة 1 من 4',
      title: 'محرر النص المصري والنماذج',
      description: 'اكتب نصك بالعامية أو اضغط أحد النماذج السريعة بالأعلى لتعبئة النص وضبط المشاعر تلقائياً.',
      actionLabel: 'جرّب تعبئة نموذج مصري',
      actionHandler: () => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('شاب قاهري')
        ) as HTMLButtonElement | undefined;
        btn?.click();
      },
    },
    {
      targetId: 'tour-tone-controls',
      badge: 'الخطوة 2 من 4',
      title: 'ضبط المشاعر وسرعة الإلقاء',
      description: 'تحكم في قوة الانفعال (Exaggeration) والسرعة (CFG). جرب الأنماط السريعة مثل "حماسي" أو "هادئ".',
      actionLabel: 'جرّب نمط "حماسي"',
      actionHandler: () => {
        const dramaticBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('حماسي')
        ) as HTMLButtonElement | undefined;
        dramaticBtn?.click();
      },
    },
    {
      targetId: 'tour-voice-select',
      badge: 'الخطوة 3 من 4',
      title: 'اختيار الصوت واستنساخه',
      description: 'استخدم صوت نماء الافتراضي، أو ارفع عينة من صوتك (5-15 ثانية) من صفحة الأصوات لاستنساخه مجاناً.',
      actionLabel: 'معاينة الصوت الافتراضي',
      actionHandler: () => {
        const auditionBtn = document.querySelector('[title="استمع لعينة الصوت"]') as HTMLButtonElement | null;
        auditionBtn?.click();
      },
    },
    {
      targetId: 'tour-generate-button',
      badge: 'الخطوة 4 من 4',
      title: 'توليد الصوت الفوري',
      description: 'اضغط على زر التوليد في شريط المحرر، أو استخدم الاختصار السريع (⌘ + Enter) في أي وقت.',
    },
  ];

  const current = steps[currentStep];

  // Auto-launch on first visit
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('namaa_studio_guide_seen');
    if (!hasSeenGuide) {
      const timer = setTimeout(() => setIsOpen(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for custom trigger from header
  useEffect(() => {
    const handleTrigger = () => {
      setCurrentStep(0);
      setIsOpen(true);
    };
    window.addEventListener(TOUR_EVENT, handleTrigger);
    return () => window.removeEventListener(TOUR_EVENT, handleTrigger);
  }, []);

  // Apply subtle non-blocking highlight ring to current target
  useEffect(() => {
    if (!isOpen || !current?.targetId) return;

    const el = document.getElementById(current.targetId);
    if (!el) return;

    // Scroll gently into view if needed
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Add ring highlight
    el.classList.add('ring-2', 'ring-primary', 'ring-offset-4', 'ring-offset-background', 'transition-all', 'duration-300');

    return () => {
      el.classList.remove('ring-2', 'ring-primary', 'ring-offset-4', 'ring-offset-background');
    };
  }, [isOpen, currentStep, current?.targetId]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    localStorage.setItem('namaa_studio_guide_seen', 'true');
  };

  if (!isOpen) return null;

  return (
    <div
      role="complementary"
      aria-label="مرشد الاستوديو"
      style={{ position: 'fixed', bottom: '24px', left: '24px', zIndex: 9999 }}
      className="max-w-sm w-[calc(100vw-3rem)] animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl p-4 shadow-2xl shadow-primary/10 text-right space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-primary/10 text-primary">
              <Compass className="h-4 w-4 animate-spin-slow" />
            </span>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-primary/30 text-primary font-mono">
              {current.badge}
            </Badge>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
            title="إغلاق المرشد"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <span>{current.title}</span>
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {current.description}
          </p>
        </div>

        {/* Interactive Try-It Action Button */}
        {current.actionLabel && current.actionHandler && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              current.actionHandler?.();
              toast.success('تم تجربة الخطوة بنجاح!');
            }}
            className="w-full h-8 text-xs font-semibold gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl cursor-pointer active:scale-98 transition-all"
          >
            <Sparkles className="h-3 w-3" />
            <span>{current.actionLabel}</span>
          </Button>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
          {/* Step dots */}
          <div className="flex items-center gap-1">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {currentStep > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
              >
                السابق
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={handleNext}
              className="h-7 px-3 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg cursor-pointer active:scale-95"
            >
              {currentStep === steps.length - 1 ? 'إنهاء' : 'التالي'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
