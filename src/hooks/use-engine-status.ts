'use client';

import { useQuery } from '@tanstack/react-query';

interface EngineStatus {
  isOnline: boolean;
  modelLoaded?: boolean;
  device?: string;
  uptime?: number;
}

export function useEngineStatus() {
  return useQuery<EngineStatus>({
    queryKey: ['engine-status'],
    queryFn: async () => {
      try {
        // Proxied through our own origin — see src/app/api/engine-status/route.ts.
        // Talking to the engine directly from the browser needs its CORS
        // allowlist to name this exact port, which it does not.
        const response = await fetch('/api/engine-status');
        if (!response.ok) return { isOnline: false };
        return await response.json();
      } catch {
        return { isOnline: false };
      }
    },
    refetchInterval: 10000,
  });
}
