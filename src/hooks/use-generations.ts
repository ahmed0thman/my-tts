'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getGenerations,
  getGeneration,
  createGeneration,
  deleteGeneration,
  retryGeneration,
  getGenerationStats
} from '@/actions/generation';

export function useGenerations(params?: { page?: number; pageSize?: number; voiceProfileId?: string; status?: string }) {
  return useQuery({
    queryKey: ['generations', params],
    queryFn: async () => {
      const result = await getGenerations(params);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useGeneration(id: string) {
  return useQuery({
    queryKey: ['generation', id],
    queryFn: async () => {
      const result = await getGeneration(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useCreateGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FormData | { text: string; voiceProfileId?: string; modelId?: string; params?: Record<string, number>; outputDir?: string }) => {
      const result = await createGeneration(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation-stats'] });
    },
    onError: (error: Error) => {
      toast.error(`فشل في إنشاء الصوت: ${error.message}`);
    },
  });
}

export function useDeleteGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteGeneration(id);
      if (!result.success) throw new Error(result.error);
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['generations'] });
      const previousGenerations = queryClient.getQueryData(['generations']);

      queryClient.setQueryData(['generations'], (old: any) => {
        if (!old) return old;
        // Simple optimistic update assuming basic structure, can be adjusted based on exact params if needed
        return old; // In a full implementation, we'd filter the deleted ID out of the specific pages
      });

      return { previousGenerations };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation-stats'] });
      toast.success('Generation deleted');
    },
    onError: (error: Error, _, context) => {
      if (context?.previousGenerations) {
        queryClient.setQueryData(['generations'], context.previousGenerations);
      }
      toast.error(`Failed to delete generation: ${error.message}`);
    },
  });
}

export function useRetryGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await retryGeneration(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation-stats'] });
      toast.success('Generation retried successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to retry generation: ${error.message}`);
    },
  });
}

export function useGenerationStats() {
  return useQuery({
    queryKey: ['generation-stats'],
    queryFn: async () => {
      const result = await getGenerationStats();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}
