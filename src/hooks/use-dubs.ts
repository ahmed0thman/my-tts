'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  applyTranslation,
  assembleDub,
  createDubFromExisting,
  deleteDub,
  getDub,
  getDubs,
  renameDub,
  renderDubLine,
  restoreSourceText,
  transcribeDub,
  updateLineText,
} from '@/actions/dubs';
import type { RenderSettings } from '@/lib/validations';

function unwrap<T>(result: { success: boolean; data?: T; error?: string }): T {
  if (!result.success) throw new Error(result.error);
  return result.data as T;
}

export type DubSummary = Extract<Awaited<ReturnType<typeof getDubs>>, { success: true }>['data'][number];
export type DubDetail = Extract<Awaited<ReturnType<typeof getDub>>, { success: true }>['data'];
export type DubLine = DubDetail['lines'][number];

export function useDubs() {
  return useQuery({ queryKey: ['dubs'], queryFn: async () => unwrap(await getDubs()) });
}

export function useDub(id: string) {
  return useQuery({ queryKey: ['dub', id], queryFn: async () => unwrap(await getDub(id)), enabled: !!id });
}

function useInvalidateDub(id?: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (id) queryClient.invalidateQueries({ queryKey: ['dub', id] });
    queryClient.invalidateQueries({ queryKey: ['dubs'] });
    queryClient.invalidateQueries({ queryKey: ['generations'] });
    queryClient.invalidateQueries({ queryKey: ['generation-stats'] });
  }, [queryClient, id]);
}

/**
 * Upload a video and start a dub from it. XHR rather than fetch for the
 * upload progress — a video takes long enough to need a bar.
 */
export function useUploadDub() {
  const invalidate = useInvalidateDub();
  const [progress, setProgress] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: ({ file, title }: { file: File; title: string }) =>
      new Promise<{ id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const query = new URLSearchParams({ name: file.name, title });
        xhr.open('POST', `/api/dubs?${query}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((100 * e.loaded) / e.total));
        };
        xhr.onload = () => {
          let body: any = {};
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            // Not JSON; the status is all we have.
          }
          if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve(body);
          else reject(new Error(body.error || `فشل الرفع (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع'));
        setProgress(0);
        xhr.send(file);
      }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setProgress(null),
  });
  return { ...mutation, progress };
}

export function useCreateDubFromExisting() {
  const invalidate = useInvalidateDub();
  return useMutation({
    mutationFn: async ({ sourceId, title }: { sourceId: string; title: string }) =>
      unwrap(await createDubFromExisting(sourceId, title)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRenameDub(id: string) {
  const invalidate = useInvalidateDub(id);
  return useMutation({
    mutationFn: async (title: string) => unwrap(await renameDub(id, title)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteDub() {
  const invalidate = useInvalidateDub();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteDub(id)),
    onSuccess: () => {
      invalidate();
      toast.success('اتمسحت');
    },
    onError: (error: Error) => toast.error(`فشل المسح: ${error.message}`),
  });
}

export function useTranscribeDub(id: string) {
  const invalidate = useInvalidateDub(id);
  return useMutation({
    mutationFn: async (input: { language?: string; settings: RenderSettings }) => unwrap(await transcribeDub(id, input)),
    onSuccess: ({ lines }) => {
      invalidate();
      toast.success(`اتفرّغ الكلام: ${lines} سطر`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useApplyTranslation(id: string) {
  const invalidate = useInvalidateDub(id);
  return useMutation({
    mutationFn: async (texts: string[]) => unwrap(await applyTranslation(id, texts)),
    onSuccess: ({ changed }) => {
      invalidate();
      toast.success(changed > 0 ? `اتحط النص الجديد على ${changed} سطر` : 'النص زي ما هو، مفيش حاجة اتغيّرت');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRestoreSourceText(id: string) {
  const invalidate = useInvalidateDub(id);
  return useMutation({
    mutationFn: async () => unwrap(await restoreSourceText(id)),
    onSuccess: ({ changed }) => {
      invalidate();
      toast.success(`رجع الكلام الأصلي على ${changed} سطر`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateLineText(dubId: string) {
  const invalidate = useInvalidateDub(dubId);
  return useMutation({
    mutationFn: async (input: { id: string; text: string }) => unwrap(await updateLineText(input.id, input.text)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRetakeLine(dubId: string) {
  const invalidate = useInvalidateDub(dubId);
  return useMutation({
    mutationFn: async (input: { id: string; settings: RenderSettings; text?: string }) =>
      unwrap(await renderDubLine(input.id, { settings: input.settings, text: input.text })),
    onSuccess: invalidate,
    onError: (error: Error) => {
      invalidate();
      toast.error(`فشل التوليد: ${error.message}`);
    },
  });
}

export function useAssembleDub(id: string) {
  const invalidate = useInvalidateDub(id);
  return useMutation({
    mutationFn: async (input: { background: number; outputDir?: string }) => unwrap(await assembleDub(id, input)),
    onSuccess: ({ dub, spedUp, trimmed }) => {
      invalidate();
      const notes = [
        spedUp > 0 ? `${spedUp} سطر اتسرّع شوية عشان يلحق مكانه` : '',
        trimmed > 0 ? `${trimmed} سطر اتقص آخره — قصّر نصه وولّده تاني` : '',
      ].filter(Boolean);
      toast.success('الفيديو المدبلج جاهز', { description: [dub.outputSavedPath, ...notes].filter(Boolean).join('\n') });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Renders a dub's lines one at a time, in order — the same contract as the
 * episode queue (`useRenderQueue`): one model under one lock, stopping only
 * between lines, and leaving the page stops it the same way.
 */
export function useDubRenderQueue(dubId: string) {
  const invalidate = useInvalidateDub(dubId);
  const [state, setState] = useState<{ total: number; done: number; failed: number; currentId: string | null } | null>(
    null,
  );
  const stopRequested = useRef(false);
  const running = useRef(false);

  useEffect(
    () => () => {
      stopRequested.current = true;
    },
    [],
  );

  const start = useCallback(
    async (ids: string[], settings: RenderSettings) => {
      if (running.current || ids.length === 0) return;
      running.current = true;
      stopRequested.current = false;
      let done = 0;
      let failed = 0;
      for (const id of ids) {
        if (stopRequested.current) break;
        setState({ total: ids.length, done, failed, currentId: id });
        try {
          const result = await renderDubLine(id, { settings });
          if (!result.success) failed += 1;
        } catch {
          failed += 1;
        }
        done += 1;
        invalidate();
      }
      const stopped = stopRequested.current && done < ids.length;
      running.current = false;
      setState(null);
      if (stopped) toast.info(`اتوقف التوليد بعد ${done} من ${ids.length} — الباقي لسه في الانتظار`);
      else if (failed > 0) toast.error(`خلص التوليد، بس ${failed} سطر فشل — راجعهم وأعد توليدهم`);
      else toast.success(`اتولّد ${done} سطر`);
    },
    [invalidate],
  );

  const stop = useCallback(() => {
    stopRequested.current = true;
  }, []);

  return { start, stop, state, isRunning: state !== null };
}
