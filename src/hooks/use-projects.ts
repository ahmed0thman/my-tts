'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createProject, deleteProject, getProject, getProjects, updateProject } from '@/actions/projects';

/** Unwraps the `{ success, data, error }` envelope every action returns. */
function unwrap<T>(result: { success: boolean; data?: T; error?: string }): T {
  if (!result.success) throw new Error(result.error);
  return result.data as T;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => unwrap(await getProjects()),
  });
}

export type ProjectDetail = Extract<Awaited<ReturnType<typeof getProject>>, { success: true }>['data'];
export type ProjectEpisode = ProjectDetail['episodes'][number];

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => unwrap(await getProject(id)),
    enabled: !!id,
  });
}

/** Project edits show up on the project page and in the list; history badges carry the title. */
function useInvalidateProject(projectId?: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (projectId) queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['generations'] });
  }, [queryClient, projectId]);
}

export function useCreateProject() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string }) => unwrap(await createProject(input)),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(`فشل إنشاء المشروع: ${error.message}`),
  });
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidateProject(id);
  return useMutation({
    mutationFn: async (input: { title: string; description?: string }) => unwrap(await updateProject(id, input)),
    onSuccess: () => {
      invalidate();
      toast.success('اتحفظت بيانات المشروع');
    },
    onError: (error: Error) => toast.error(`فشل حفظ المشروع: ${error.message}`),
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteProject(id)),
    onSuccess: () => {
      invalidate();
      toast.success('اتمسح المشروع');
    },
    onError: (error: Error) => toast.error(`فشل مسح المشروع: ${error.message}`),
  });
}
