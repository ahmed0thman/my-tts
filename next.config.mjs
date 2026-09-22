/**
 * Plain JavaScript, deliberately.
 *
 * Next parses this file at boot, including under `next start` in production.
 * As `next.config.ts` that parse needs the `typescript` package present — and
 * in a packaged desktop build typescript is a devDependency that is correctly
 * pruned away, so Next tried to `yarn add typescript` into the .app at launch
 * and hung until the supervisor's readiness timeout killed it. A .mjs config
 * needs nothing at runtime.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
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
