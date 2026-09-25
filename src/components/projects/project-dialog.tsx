'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { projectSchema, type ProjectFormValues } from '@/lib/validations';
import { useCreateProject, useUpdateProject } from '@/hooks/use-projects';
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

interface ProjectDialogProps {
  children: React.ReactNode;
  /** Omit to create a new project (and open it); pass one to edit it. */
  project?: { id: string; title: string; description: string | null };
}

export function ProjectDialog({ children, project }: ProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const isPending = create.isPending || update.isPending;

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { title: project?.title ?? '', description: project?.description ?? '' },
  });

  // Re-seed each time the dialog opens, so an edit starts from what is saved
  // rather than from whatever was typed and cancelled last time.
  useEffect(() => {
    if (open) form.reset({ title: project?.title ?? '', description: project?.description ?? '' });
  }, [open, project?.title, project?.description, form]);

  const onSubmit = async (values: ProjectFormValues) => {
    if (project) {
      await update.mutateAsync(values);
      setOpen(false);
    } else {
      const created = await create.mutateAsync(values);
      setOpen(false);
      if (created?.id) router.push(`/projects/${created.id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? 'تعديل المشروع' : 'مشروع جديد'}</DialogTitle>
          <DialogDescription>
            {project
              ? 'غيّر اسم المشروع أو وصفه. الحلقات اللي جوّاه مش هتتأثر.'
              : 'المشروع بيجمع حلقات وشورتس وأي أصوات تانية تبع نفس القناة أو السلسلة.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم المشروع</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus placeholder="مثال: بودكاست حكايات القاهرة" />
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
                    <Textarea
                      {...field}
                      value={field.value ?? ''}
                      rows={4}
                      placeholder="المشروع عن إيه، ولمين"
                    />
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
                {project ? 'حفظ' : 'إنشاء المشروع'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
