'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateSchema } from '@/lib/validations';
import { z } from 'zod';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TextInput } from './text-input';
import { VoiceControls } from './voice-controls';
import { AudioPlayer } from './audio-player';
import { MasterAudioDock } from './master-audio-dock';
import { Loader2, Sparkles, Command, Zap, CheckCircle2, Activity, FolderCheck } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { VolumeHighIcon, FlashIcon } from '@hugeicons/core-free-icons';
import { useCreateGeneration } from '@/hooks/use-generations';
import { toast } from 'sonner';

type GenerateFormValues = z.infer<typeof generateSchema>;

interface GenerationFormProps {
  mode?: 'single' | 'batch';
}

export function GenerationForm({ mode = 'single' }: GenerationFormProps) {
  const [isBatchMode, setIsBatchMode] = useState(mode === 'batch');
  const [latestAudioPath, setLatestAudioPath] = useState<string | null>(null);
  const [latestText, setLatestText] = useState<string>('');
  const [latestSavedPath, setLatestSavedPath] = useState<string | null>(null);

  useEffect(() => {
    setIsBatchMode(mode === 'batch');
  }, [mode]);

  const { mutateAsync: createGen, isPending } = useCreateGeneration();

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateSchema) as any,
    defaultValues: {
      text: '',
      voiceProfileId: 'default',
      modelId: 'silma',
      params: {},
      outputDir: '',
    },
  });

  // Keyboard shortcut: Cmd + Enter / Ctrl + Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [form]);

  const onSubmit = async (data: GenerateFormValues) => {
    try {
      if (isBatchMode) {
        const lines = data.text.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          toast.error('الرجاء كتابة نص واحد على الأقل');
          return;
        }

        toast.info(`جاري بدء توليد ${lines.length} أسطر تباعاً...`);
        for (let i = 0; i < lines.length; i++) {
          const res = await createGen({
            text: lines[i],
            voiceProfileId: data.voiceProfileId === 'default' ? undefined : data.voiceProfileId,
            modelId: data.modelId,
            params: data.params,
            outputDir: data.outputDir || undefined,
          });
          if (res?.audioPath) {
            setLatestAudioPath(`/api/audio/${res.audioPath}`);
            setLatestText(lines[i]);
            setLatestSavedPath(res.savedPath ?? null);
          }
        }
        toast.success(`اكتمل توليد ${lines.length} ملفات صوتية`, {
          description: data.outputDir || undefined,
        });
      } else {
        const res = await createGen({
          text: data.text,
          voiceProfileId: data.voiceProfileId === 'default' ? undefined : data.voiceProfileId,
          modelId: data.modelId,
          params: data.params,
          outputDir: data.outputDir || undefined,
        });

        if (res?.audioPath) {
          setLatestAudioPath(`/api/audio/${res.audioPath}`);
          setLatestText(data.text);
          setLatestSavedPath(res.savedPath ?? null);
          toast.success('تم إنشاء الصوت بنجاح!', {
            description: res.savedPath ?? undefined,
          });
        }
      }
    } catch (error) {
      toast.error('حدث خطأ أثناء إنشاء الصوت');
      console.error(error);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-5xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Main Grid: Left Editor (7) + Right Modulation (5) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7">
              <TextInput isPending={isPending} isBatchMode={isBatchMode} />
            </div>
            <div className="lg:col-span-5">
              <VoiceControls />
            </div>
          </div>
        </form>
      </Form>

      {/* Embedded Audio Studio Card */}
      <div className="pt-6 border-t border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <h3 className="text-base font-bold tracking-tight">استوديو الاستماع الصوتي</h3>
          </div>
          {latestAudioPath && (
            <Badge variant="outline" className="text-xs text-primary border-primary/30">
              جاهز للاستماع والتحميل
            </Badge>
          )}
        </div>

        <AudioPlayer src={latestAudioPath} isLoading={isPending && !isBatchMode} />

        {latestSavedPath && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <FolderCheck className="h-3.5 w-3.5 shrink-0 text-success" />
            <span className="text-[11px] font-semibold shrink-0">اتحفظ في:</span>
            <span
              dir="ltr"
              className="flex-1 truncate text-left font-mono text-[11px] text-muted-foreground"
              title={latestSavedPath}
            >
              {latestSavedPath}
            </span>
          </div>
        )}
      </div>

      {/* Floating Master Studio Deck.
          The dock is fixed, so it needs a matching spacer or it sits on top of
          the generate button — which it did on narrow viewports, where the dock
          is tallest. Reserved only while the dock is actually mounted. */}
      {latestAudioPath && (
        <div aria-hidden style={{ height: '11rem' }} className="shrink-0" />
      )}

      {latestAudioPath && (
        <MasterAudioDock
          src={latestAudioPath}
          text={latestText}
          onClose={() => setLatestAudioPath(null)}
        />
      )}
    </div>
  );
}
