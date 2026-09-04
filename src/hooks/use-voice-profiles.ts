'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getVoiceProfiles,
  createVoiceProfile,
  updateVoiceProfile,
  deleteVoiceProfile,
  setDefaultVoiceProfile,
} from '@/actions/voice-profiles';

export function useVoiceProfiles() {
  return useQuery({
    queryKey: ['voice-profiles'],
    queryFn: async () => {
      const result = await getVoiceProfiles();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreateVoiceProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await createVoiceProfile(formData);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      toast.success('Voice profile created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create voice profile: ${error.message}`);
    },
  });
}

export function useUpdateVoiceProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const result = await updateVoiceProfile(id, formData);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
    },
    onError: (error: Error) => {
      toast.error(`فشل تحديث الصوت: ${error.message}`);
    },
  });
}

export function useDeleteVoiceProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteVoiceProfile(id);
      if (!result.success) throw new Error(result.error);
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['voice-profiles'] });
      const previousProfiles = queryClient.getQueryData(['voice-profiles']);

      queryClient.setQueryData(['voice-profiles'], (old: any) => {
        if (!old) return old;
        return old.filter((profile: any) => profile.id !== id);
      });

      return { previousProfiles };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      toast.success('Voice profile deleted');
    },
    onError: (error: Error, _, context) => {
      if (context?.previousProfiles) {
        queryClient.setQueryData(['voice-profiles'], context.previousProfiles);
      }
      toast.error(`Failed to delete voice profile: ${error.message}`);
    },
  });
}

export function useSetDefaultVoiceProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await setDefaultVoiceProfile(id);
      if (!result.success) throw new Error(result.error);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      toast.success('Default voice profile updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to set default voice profile: ${error.message}`);
    },
  });
}
