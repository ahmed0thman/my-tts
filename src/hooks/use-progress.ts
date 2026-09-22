'use client';

import { useQuery } from '@tanstack/react-query';
import type { EngineProgress } from '@/lib/tts-client';

/**
 * Poll the engine's live state while a generation is running.
 *
 * Hits the Route Handler at /api/progress rather than a Server Action: actions
 * are serialized per client, so the poll would queue behind the generation it
 * is meant to be reporting on and never update until the end.
 */
export function useEngineProgress(enabled: boolean) {
  return useQuery<EngineProgress>({
    queryKey: ['engine-progress'],
    queryFn: async () => {
      const response = await fetch('/api/progress', { cache: 'no-store' });
      if (!response.ok) throw new Error('progress unavailable');
      return response.json();
    },
    enabled,
    refetchInterval: enabled ? 1000 : false,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}
