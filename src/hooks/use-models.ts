'use client';

import { useQuery } from '@tanstack/react-query';
import { getModels } from '@/actions/models';
import type { TtsModel } from '@/lib/tts-client';

export function useModels() {
  return useQuery({
    queryKey: ['tts-models'],
    queryFn: async () => {
      const result = await getModels();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    // The registry is static for the life of the engine process.
    staleTime: 5 * 60_000,
  });
}

/** Default values for a model's parameters, from its declared schema. */
export function defaultParamsFor(model?: TtsModel): Record<string, number> {
  if (!model) return {};
  return Object.fromEntries(model.params.map((p) => [p.key, p.default]));
}
