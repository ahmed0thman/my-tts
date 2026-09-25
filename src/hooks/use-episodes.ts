'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addSegments,
  createEpisode,
  deleteEpisode,
  deleteSegment,
  getEpisode,
  mergeEpisode,
  moveSegment,
  renderSegment,
  retakeSegment,
  updateEpisode,
  updateSegmentText,
} from '@/actions/episodes';
import type { EpisodeFormValues, RenderSettings } from '@/lib/validations';

/** Unwraps the `{ success, data, error }` envelope every action returns. */
function unwrap<T>(result: { success: boolean; data?: T; error?: string }): T {
  if (!result.success) throw new Error(result.error);
  return result.data as T;
}

export type EpisodeDetail = Extract<Awaited<ReturnType<typeof getEpisode>>, { success: true }>['data'];
export type EpisodeSegment = EpisodeDetail['segments'][number];

export function useEpisode(id: string) {
  return useQuery({
    queryKey: ['episode', id],
    queryFn: async () => unwrap(await getEpisode(id)),
    enabled: !!id,
  });
}

/**
 * Everything that changes an episode invalidates the episode, the project
 * page that summarises it, the project list, and the history.
 */
function useInvalidateEpisode(episodeId?: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (episodeId) queryClient.invalidateQueries({ queryKey: ['episode', episodeId] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['generations'] });
    queryClient.invalidateQueries({ queryKey: ['generation-stats'] });
  }, [queryClient, episodeId]);
}

export function useCreateEpisode(projectId: string) {
  const invalidate = useInvalidateEpisode();
  return useMutation({
    mutationFn: async (input: EpisodeFormValues) => unwrap(await createEpisode(projectId, input)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(`فشل الإنشاء: ${error.message}`),
  });
}

export function useUpdateEpisode(id: string) {
  const invalidate = useInvalidateEpisode(id);
  return useMutation({
    mutationFn: async (input: EpisodeFormValues) => unwrap(await updateEpisode(id, input)),
    onSuccess: () => {
      invalidate();
      toast.success('اتحفظت البيانات');
    },
    onError: (error: Error) => toast.error(`فشل الحفظ: ${error.message}`),
  });
}

export function useDeleteEpisode() {
  const invalidate = useInvalidateEpisode();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteEpisode(id)),
    onSuccess: () => {
      invalidate();
      toast.success('اتمسحت');
    },
    onError: (error: Error) => toast.error(`فشل المسح: ${error.message}`),
  });
}

export function useAddSegments(episodeId: string) {
  const invalidate = useInvalidateEpisode(episodeId);
  return useMutation({
    mutationFn: async (input: { texts: string[]; settings: RenderSettings }) =>
      unwrap(await addSegments(episodeId, input)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRetakeSegment(episodeId: string) {
  const invalidate = useInvalidateEpisode(episodeId);
  return useMutation({
    mutationFn: async (input: { id: string; text?: string; settings?: RenderSettings }) =>
      unwrap(await retakeSegment(input.id, { text: input.text, settings: input.settings })),
    onSuccess: () => {
      invalidate();
      toast.success('اتولّد المقطع من جديد');
    },
    // A failed retake may still have changed status on the way; refetch either way.
    onError: (error: Error) => {
      invalidate();
      toast.error(`فشلت إعادة التوليد — المقطع القديم زي ما هو: ${error.message}`);
    },
  });
}

export function useUpdateSegmentText(episodeId: string) {
  const invalidate = useInvalidateEpisode(episodeId);
  return useMutation({
    mutationFn: async (input: { id: string; text: string }) => unwrap(await updateSegmentText(input.id, input.text)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useMoveSegment(episodeId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEpisode(episodeId);
  return useMutation({
    mutationFn: async (input: { id: string; direction: 'up' | 'down' }) =>
      unwrap(await moveSegment(input.id, input.direction)),
    // Reordering is the one edit worth doing optimistically: a list that
    // lags a click behind reads as a click that did not register.
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: ['episode', episodeId] });
      const previous = queryClient.getQueryData<EpisodeDetail>(['episode', episodeId]);
      if (previous) {
        const segments = [...previous.segments];
        const index = segments.findIndex((s) => s.id === id);
        const target = direction === 'up' ? index - 1 : index + 1;
        if (index >= 0 && target >= 0 && target < segments.length) {
          [segments[index], segments[target]] = [segments[target], segments[index]];
          queryClient.setQueryData(['episode', episodeId], { ...previous, segments });
        }
      }
      return { previous };
    },
    onError: (error: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(['episode', episodeId], context.previous);
      toast.error(`فشل تحريك المقطع: ${error.message}`);
    },
    onSettled: invalidate,
  });
}

export function useDeleteSegment(episodeId: string) {
  const invalidate = useInvalidateEpisode(episodeId);
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteSegment(id)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(`فشل مسح المقطع: ${error.message}`),
  });
}

export function useMergeEpisode(episodeId: string) {
  const invalidate = useInvalidateEpisode(episodeId);
  return useMutation({
    mutationFn: async (input: { gapMs: number; outputDir?: string }) => unwrap(await mergeEpisode(episodeId, input)),
    onSuccess: (episode) => {
      invalidate();
      toast.success('اتدمجت المقاطع', { description: episode?.mergedSavedPath ?? undefined });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Renders an episode's queued segments one at a time, in running order.
 *
 * One at a time is not a choice: the engine holds one model under one lock,
 * and Next runs a client's Server Actions serially anyway. What this adds is a
 * visible position in the queue and a way to stop between segments. Stopping
 * never interrupts the segment in flight — the engine cannot abandon a render
 * — it only declines to start the next one. Leaving the page stops it the
 * same way; the rows stay PENDING, and "continue" picks them up.
 */
export function useRenderQueue(episodeId: string) {
  const invalidate = useInvalidateEpisode(episodeId);
  const [state, setState] = useState<{ total: number; done: number; failed: number; currentId: string | null } | null>(null);
  const stopRequested = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    return () => {
      stopRequested.current = true;
    };
  }, []);

  const start = useCallback(
    async (ids: string[]) => {
      if (running.current || ids.length === 0) return;
      running.current = true;
      stopRequested.current = false;
      let done = 0;
      let failed = 0;
      setState({ total: ids.length, done, failed, currentId: ids[0] });

      for (const id of ids) {
        if (stopRequested.current) break;
        setState({ total: ids.length, done, failed, currentId: id });
        try {
          const result = await renderSegment(id);
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
      if (stopped) {
        toast.info(`اتوقف التوليد بعد ${done} من ${ids.length} — الباقي لسه في الانتظار`);
      } else if (failed > 0) {
        toast.error(`خلص التوليد، بس ${failed} مقطع فشل — راجعهم وأعد توليدهم`);
      } else {
        toast.success(`اتولّد ${done} مقطع`);
      }
    },
    [invalidate],
  );

  const stop = useCallback(() => {
    stopRequested.current = true;
  }, []);

  return { start, stop, state, isRunning: state !== null };
}
