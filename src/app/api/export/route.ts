import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { STORAGE_ROOT } from '@/lib/storage';
import { zipEntries, type ZipEntry } from '@/lib/zip';

/**
 * Bundle the chosen history clips into one ZIP.
 *
 * A Route Handler rather than a Server Action: the response is a large binary
 * and the browser needs it as a download, not as a serialized action result.
 * POST because ten ids do not belong in a URL.
 *
 * ZIP64 is not written, so the total is capped well under 4 GB.
 */
export const dynamic = 'force-dynamic';

const MAX_TOTAL_BYTES = 2 * 1024 ** 3;
const MAX_IDS = 500;

/** A file name made of the clip's opening words, safe on every filesystem. */
function slug(text: string): string {
  return text
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
}

export async function POST(request: NextRequest) {
  let ids: unknown;
  try {
    ({ ids } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || ids.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Send between 1 and 500 clip ids' }, { status: 400 });
  }

  const rows = await prisma.generation.findMany({
    where: { id: { in: ids as string[] }, status: 'COMPLETED', audioPath: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { text: true, audioPath: true },
  });

  const entries: ZipEntry[] = [];
  const used = new Set<string>();
  let total = 0;

  for (const row of rows) {
    const relative = row.audioPath!.replace(/^\/?storage\//, '');
    const absolute = path.resolve(STORAGE_ROOT, relative);
    if (!absolute.startsWith(STORAGE_ROOT + path.sep)) continue;

    let size: number;
    try {
      size = (await fs.stat(absolute)).size;
    } catch {
      continue; // the row outlived its file
    }
    total += size;

    const base = `${String(entries.length + 1).padStart(3, '0')} - ${slug(row.text) || 'clip'}`;
    let name = `${base}.wav`;
    for (let n = 2; used.has(name); n++) name = `${base} (${n}).wav`;
    used.add(name);
    entries.push({ name, path: absolute });
  }

  if (!entries.length) {
    return NextResponse.json({ error: 'No finished clips with audio in the selection' }, { status: 404 });
  }
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: 'Selection is too large for one archive' }, { status: 413 });
  }

  const source = zipEntries(entries);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await source.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await source.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="sawtak-clips-${Date.now()}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
