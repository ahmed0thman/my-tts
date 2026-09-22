import { NextResponse } from 'next/server';
import { getProgress } from '@/lib/tts-client';

/**
 * Proxy for the engine's live progress.
 *
 * Deliberately a Route Handler and not a Server Action: Next.js runs Server
 * Actions **serially per client**, so a poll issued during a generation sits in
 * the queue behind it and only resolves once the thing it was reporting on has
 * finished. Route Handlers are not queued.
 *
 * Proxying (rather than calling the engine from the browser) keeps TTS_ENGINE_URL
 * server-side, consistent with the rest of the app.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getProgress());
  } catch {
    // The engine may be restarting; the generation itself is unaffected, so a
    // failed poll must stay quiet rather than surface as a generation error.
    return NextResponse.json({ state: 'unknown' }, { status: 503 });
  }
}
