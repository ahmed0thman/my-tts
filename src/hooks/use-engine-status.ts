'use client';

import { useQuery } from '@tanstack/react-query';

interface EngineStatus {
  isOnline: boolean;
  modelLoaded?: boolean;
  device?: string;
  uptime?: number;
  /** Where the Next server reaches the engine — `unix:/…/engine.sock` by default. */
  address?: string;
}

export function useEngineStatus() {
  return useQuery<EngineStatus>({
    queryKey: ['engine-status'],
    queryFn: async () => {
      try {
        // Proxied through our own origin — see src/app/api/engine-status/route.ts.
        // The engine listens on a Unix socket, which the browser cannot open.
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
