'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { episodeSchema, type EpisodeFormValues } from '@/lib/validations';
import { EPISODE_KINDS, type EpisodeKind } from '@/lib/projects';
import { useCreateEpisode, useUpdateEpisode } from '@/hooks/use-episodes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';

interface EpisodeDialogProps {
  children: React.ReactNode;
  projectId: string;
  /** Omit to create a new episode (and open it); pass one to edit it. */
  episode?: { id: string; title: string; description: string | null; kind: string };
}

export function EpisodeDialog({ children, projectId, episode }: EpisodeDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateEpisode(projectId);
  const update = useUpdateEpisode(episode?.id ?? '');
  const isPending = create.isPending || update.isPending;

  const initial = (): EpisodeFormValues => ({
    title: episode?.title ?? '',
    description: episode?.description ?? '',
    kind: (episode?.kind as EpisodeKind) ?? 'episode',
  });

  const form = useForm<EpisodeFormValues>({
    resolver: zodResolver(episodeSchema) as any,
    defaultValues: initial(),
  });

  // Re-seed each time the dialog opens, so an edit starts from what is saved.
  useEffect(() => {
    if (open) form.reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, episode?.title, episode?.description, episode?.kind]);

  const onSubmit = async (values: EpisodeFormValues) => {
    if (episode) {
      await update.mutateAsync(values);
      setOpen(false);
    } else {
      const created = await create.mutateAsync(values);
      setOpen(false);
      if (created?.id) router.push(`/projects/${projectId}/episodes/${created.id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{episode ? 'تعديل البيانات' : 'صوت جديد في المشروع'}</DialogTitle>
          <DialogDescription>
            {episode
              ? 'غيّر الاسم أو النوع أو الوصف. المقاطع مش هتتأثر.'
              : 'حلقة، شورت، أو أي صوت تاني. هتكتب السكريبت جوّاه وتولّده مقطع مقطع، وبعدين تدمجه في ملف واحد.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>النوع</FormLabel>
                  <div role="radiogroup" className="flex gap-1 rounded-xl border border-border bg-muted p-1">
                    {EPISODE_KINDS.map((kind) => (
                      <button
                        key={kind.id}
                        type="button"
                        role="radio"
                        aria-checked={field.value === kind.id}
                        onClick={() => field.onChange(kind.id)}
                        className={cn(
                          'flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                          field.value === kind.id
                            ? 'border border-border-strong bg-elevated text-primary shadow-plate'
                            : 'border border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {kind.label}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus placeholder="مثال: الحلقة ١٢ — قصة القاهرة القديمة" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    الوصف <span className="font-normal text-muted-foreground">(اختياري)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ''} rows={3} placeholder="عن إيه، وأي ملاحظات عن الأداء" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {episode ? 'حفظ' : 'إنشاء'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
