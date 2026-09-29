'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listDirectories, checkDirectory, makeDirectory } from '@/actions/filesystem';

/**
 * Browse the sub-directories of `path`. Pass `enabled: false` to hold off
 * until the picker dialog is actually opened.
 */
export function useDirectoryListing(path: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['directory-listing', path ?? ''],
    queryFn: async () => {
      const result = await listDirectories(path);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled,
    staleTime: 10_000,
    retry: false,
  });
}

/**
 * Validate a save folder without creating it.
 */
export function useDirectoryCheck(path: string, enabled = true) {
  return useQuery({
    queryKey: ['directory-check', path],
    queryFn: async () => {
      const result = await checkDirectory(path);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: enabled && !!path,
    staleTime: 10_000,
    retry: false,
  });
}

/**
 * Create a folder, then refresh the listing it appears in.
 */
export function useCreateDirectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { parent: string; name: string }) => {
      const result = await makeDirectory(input.parent, input.name);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['directory-listing'] }),
  });
}
