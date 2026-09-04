import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Voice references travel to the engine through a Server Action, and the
      // 1 MB default rejects anything past ~20s of 24 kHz mono WAV. Matches the
      // 10 MB ceiling the upload dialog advertises, with room for form overhead.
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
