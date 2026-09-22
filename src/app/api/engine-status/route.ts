import { NextResponse } from 'next/server';
import { getHealth } from '@/lib/tts-client';

/**
 * Engine health, proxied.
 *
 * The sidebar badge used to `fetch('http://localhost:8000/api/health')` from
 * the browser. That put the engine's URL in client code — which the
 * architecture rules forbid — and made the badge depend on the engine's CORS
 * allowlist, which names `http://localhost:3000` and nothing else. Any other
 * port (the desktop app falls back to one when 3000 is taken) showed a healthy
 * engine as offline.
 *
 * A Route Handler rather than a Server Action, for the same reason the
 * progress poll is one: Next runs Server Actions serially per client, so a
 * poll written as an action queues behind whatever generation is running and
 * reports stale state for the length of it.
 */
export async function GET() {
  try {
    const health = await getHealth();
    return NextResponse.json({
      isOnline: true,
      modelLoaded: health.model_loaded,
      device: health.device,
      uptime: health.uptime,
    });
  } catch {
    // The engine being down is an ordinary state here, not a server error.
    return NextResponse.json({ isOnline: false });
  }
}
