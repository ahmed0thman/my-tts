'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getPresets,
  createPreset,
  deletePreset,
} from '@/actions/presets';

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: async () => {
      const result = await getPresets();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FormData | { name: string; description?: string; modelId?: string; params?: Record<string, number>; voiceProfileId?: string }) => {
      const result = await createPreset(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presets'] });
    },
    onError: (error: Error) => {
      toast.error(`فشل في حفظ الإعداد: ${error.message}`);
    },
  });
}

export function useDeletePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deletePreset(id);
      if (!result.success) throw new Error(result.error);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presets'] });
      toast.success('Preset deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete preset: ${error.message}`);
    },
  });
}
