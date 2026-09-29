'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteClip, getClips, insertClipIntoEpisode, renameClip, saveToLibrary } from '@/actions/clips';

/** Unwraps the `{ success, data, error }` envelope every action returns. */
function unwrap<T>(result: { success: boolean; data?: T; error?: string }): T {
  if (!result.success) throw new Error(result.error);
  return result.data as T;
}

export type LibraryClip = Extract<Awaited<ReturnType<typeof getClips>>, { success: true }>['data'][number];

/** Audio going up to a Route Handler, which answers `{ error }` on failure. */
async function postAudio<T>(url: string, fields: Record<string, string | Blob>): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const response = await fetch(url, { method: 'POST', body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
}

export function useClips() {
  return useQuery({ queryKey: ['clips'], queryFn: async () => unwrap(await getClips()) });
}

function useInvalidate(episodeId?: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['clips'] });
    if (episodeId) {
      queryClient.invalidateQueries({ queryKey: ['episode', episodeId] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  };
}

/** Save an upload or a recording to the library. */
export function useCreateClip() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { file: File; name: string; source: 'upload' | 'recording' }) =>
      postAudio<LibraryClip>('/api/clips', input),
    onSuccess: (clip) => {
      invalidate();
      toast.success(`«${clip.name}» اتحفظ في المكتبة`);
    },
    onError: (error: Error) => toast.error(`فشل الحفظ: ${error.message}`),
  });
}

export function useRenameClip() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => unwrap(await renameClip(id, name)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(`فشل تغيير الاسم: ${error.message}`),
  });
}

export function useDeleteClip() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteClip(id)),
    onSuccess: () => {
      invalidate();
      toast.success('اتمسح من المكتبة');
    },
    onError: (error: Error) => toast.error(`فشل المسح: ${error.message}`),
  });
}

/** Save a copy of a take to the library. */
export function useSaveToLibrary() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ generationId, name }: { generationId: string; name: string }) =>
      unwrap(await saveToLibrary(generationId, name)),
    onSuccess: (clip) => {
      invalidate();
      toast.success(`«${clip.name}» اتحفظ في المكتبة`);
    },
    onError: (error: Error) => toast.error(`فشل الحفظ: ${error.message}`),
  });
}

/**
 * Add audio to an episode at `position` (null = the end): a library clip, or
 * an upload / recording (optionally saved to the library as well).
 */
export function useAddAudioSegment(episodeId: string) {
  const invalidate = useInvalidate(episodeId);
  return useMutation({
    mutationFn: async (
      input:
        | { kind: 'library'; clipId: string; position: number | null }
        | {
            kind: 'upload' | 'recording';
            file: File;
            name: string;
            position: number | null;
            saveToLibrary: boolean;
          },
    ) => {
      if (input.kind === 'library') {
        return unwrap(await insertClipIntoEpisode(episodeId, input.clipId, input.position));
      }
      return postAudio<{ id: string }>(`/api/episodes/${episodeId}/audio`, {
        file: input.file,
        name: input.name,
        source: input.kind,
        position: input.position == null ? '' : String(input.position),
        saveToLibrary: input.saveToLibrary ? '1' : '',
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success('الصوت اتضاف للحلقة');
    },
    onError: (error: Error) => toast.error(`فشلت الإضافة: ${error.message}`),
  });
}
