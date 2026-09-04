'use client';

import { useQuery } from '@tanstack/react-query';
import { listDirectories, checkDirectory } from '@/actions/filesystem';

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
