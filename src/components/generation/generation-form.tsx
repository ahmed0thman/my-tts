'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateSchema } from '@/lib/validations';
import { z } from 'zod';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextInput } from './text-input';
import { VoiceControls } from './voice-controls';
import { ClipCard, PendingClipCard } from './clip-card';
import { ClipGrid, PaneHeading, WorkspaceSplit } from '@/components/layout/workspace-split';
import { Headphones } from 'lucide-react';
import { useCreateGeneration, useDeleteGeneration, useGenerations, useRetryGeneration } from '@/hooks/use-generations';
import { useConfirm } from '@/providers/confirm-provider';
import { toast } from 'sonner';
import Link from 'next/link';
import { DEFAULT_MODEL_ID } from '@/lib/models';

type GenerateFormValues = z.infer<typeof generateSchema>;

interface GenerationFormProps {
  mode?: 'single' | 'batch';
  /** The page's title block, placed above both panes. */
  header?: ReactNode;
}

/**
 * The studio: text and voice settings on the right, every take as a card in
 * a grid on the left (WorkspaceSplit). The newest take is marked and plays
 * on its own.
 */
const PAGE = 24;

export function GenerationForm({ mode = 'single', header }: GenerationFormProps) {
  const [isBatchMode, setIsBatchMode] = useState(mode === 'batch');
  // The take generated last in this visit: marked, scrolled to and played.
  const [latestId, setLatestId] = useState<string | null>(null);
  // What is rendering right now, shown as a card until its row exists.
  const [pending, setPending] = useState<{ text: string; label?: string } | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    setIsBatchMode(mode === 'batch');
  }, [mode]);

  const { mutateAsync: createGen, isPending } = useCreateGeneration();
  const { data: clips, isLoading: clipsLoading } = useGenerations({ page: 1, pageSize: limit, studioOnly: true });
  const { mutate: deleteGen } = useDeleteGeneration();
  const { mutate: retryGen, isPending: isRetrying } = useRetryGeneration();
  const confirm = useConfirm();
  const isGenerating = isPending || isRetrying;

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateSchema) as any,
    defaultValues: {
      text: '',
      voiceProfileId: 'default',
      modelId: DEFAULT_MODEL_ID,
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
    const request = (text: string) =>
      createGen({
        text,
        voiceProfileId: data.voiceProfileId === 'default' ? undefined : data.voiceProfileId,
        modelId: data.modelId,
        params: data.params,
        outputDir: data.outputDir || undefined,
      });

    try {
      if (isBatchMode) {
        const lines = data.text.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          toast.error('الرجاء كتابة نص واحد على الأقل');
          return;
        }

        for (let i = 0; i < lines.length; i++) {
          setPending({ text: lines[i], label: `بيتولّد ${i + 1} من ${lines.length}` });
          const res = await request(lines[i]);
          if (res?.id) setLatestId(res.id);
        }
        toast.success(`اكتمل توليد ${lines.length} ملفات صوتية`, {
          description: data.outputDir || undefined,
        });
      } else {
        setPending({ text: data.text });
        const res = await request(data.text);
        if (res?.id) {
          setLatestId(res.id);
          toast.success('تم إنشاء الصوت بنجاح!', {
            description: res.savedPath ?? undefined,
          });
        }
      }
    } catch (error) {
      // useCreateGeneration already showed the reason.
      console.error(error);
    } finally {
      setPending(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirm({ title: 'تمسح التسجيل ده؟', confirmLabel: 'امسح', destructive: true })) {
      deleteGen(id);
    }
  };

  const reuseText = (text: string) => {
    form.setValue('text', text, { shouldDirty: true, shouldValidate: true });
    document.querySelector<HTMLTextAreaElement>('#tour-text-input textarea')?.focus();
  };

  const items: any[] = clips?.items ?? [];
  const total = clips?.total ?? 0;

  const controls = (
    <>
      {/* Batch mode here is fire-and-forget: the clips land in the grid,
          unordered and unmerged. A long piece belongs in a project. */}
      {isBatchMode && (
        <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm">
          <p>
            بتعمل حلقة أو فيديو طويل؟ المشاريع بتحفظ ترتيب المقاطع، وتخليك تراجع وتعيد كل مقطع لوحده، وبتدمجهم في ملف
            واحد.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/projects">افتح المشاريع</Link>
          </Button>
        </div>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <TextInput isPending={isPending} isBatchMode={isBatchMode} />
        <VoiceControls />
      </form>
    </>
  );

  const toolbar = (
    <PaneHeading
      title="التسجيلات"
      meta={
        total > 0 && (
          <>
            <span className="numeric font-semibold text-foreground">{total}</span> تسجيل
          </>
        )
      }
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/history">السجل كله</Link>
        </Button>
      }
    />
  );

  return (
    <Form {...form}>
      <WorkspaceSplit header={header} controls={controls} toolbar={toolbar}>
        {clipsLoading ? (
          <ClipGrid>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </ClipGrid>
        ) : items.length === 0 && !pending ? (
          <div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
              <Headphones className="h-5 w-5" />
            </span>
            <p className="text-sm font-bold">لسه مفيش تسجيلات</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              اكتب النص على اليمين واضغط «توليد الصوت» — كل تسجيل هيظهر هنا كارت تسمعه وتحمّله وتعدّله.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <ClipGrid>
              {pending && <PendingClipCard text={pending.text} label={pending.label} />}
              {items.map((generation) => (
                <ClipCard
                  key={generation.id}
                  generation={generation}
                  isNew={generation.id === latestId}
                  isGenerating={isGenerating}
                  onReuse={reuseText}
                  onRetry={() => retryGen(generation.id, { onSuccess: (res: any) => res?.id && setLatestId(res.id) })}
                  onDelete={() => void handleDelete(generation.id)}
                />
              ))}
            </ClipGrid>
            {items.length < total && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                  اعرض أقدم
                </Button>
              </div>
            )}
          </div>
        )}
      </WorkspaceSplit>
    </Form>
  );
}
