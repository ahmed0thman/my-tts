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
        const url = `${process.env.NEXT_PUBLIC_TTS_ENGINE_URL || 'http://localhost:8000'}/api/health`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { isOnline: false };
        }
        
        const data = await response.json();
        return {
          isOnline: true,
          ...data,
        };
      } catch (error) {
        return { isOnline: false };
      }
    },
    refetchInterval: 10000,
  });
}
