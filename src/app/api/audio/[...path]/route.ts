import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');

/**
 * Callers hand us the path in whichever shape they happen to hold:
 * `audio/gen_x.wav`, `/storage/audio/gen_x.wav` (the engine's X-Audio-Path)
 * or a full filesystem path (a voice profile's referenceAudioPath).
 * Normalize all three down to a path relative to storage/.
 */
function toStorageRelative(segments: string[]): string {
  const lastStorageIndex = segments.lastIndexOf('storage');
  const relevant = lastStorageIndex === -1 ? segments : segments.slice(lastStorageIndex + 1);
  return relevant.filter(Boolean).join('/');
}

/**
 * Wrap a Node read stream as a web stream.
 *
 * The `cancel` hook matters: media elements routinely abort a response
 * mid-flight (seeking, switching track, unmounting the player). Without
 * destroying the underlying file handle there, Node raises an *uncaught*
 * "Invalid state: ReadableStream is already closed" and can take the server
 * down with it. The closed flag guards the same race on data/end/error.
 */
function toWebStream(nodeStream: fs.ReadStream): ReadableStream<Uint8Array> {
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        if (closed) return;
        controller.enqueue(new Uint8Array(chunk as Buffer));
      });
      nodeStream.on('end', () => {
        if (closed) return;
        closed = true;
        controller.close();
      });
      nodeStream.on('error', (error) => {
        if (closed) return;
        closed = true;
        controller.error(error);
      });
    },
    cancel() {
      closed = true;
      nodeStream.destroy();
    },
  });
}

/** Parses a single `bytes=start-end` range against a known file size. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;

  // "bytes=-500" means the last 500 bytes
  if (rawStart === '') {
    if (rawEnd === '') return null;
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === '' ? size - 1 : Number(rawEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;

  return { start, end: Math.min(end, size - 1) };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const p = await params;
    const filePathArray = p.path;

    if (!filePathArray || filePathArray.length === 0) {
      return new NextResponse('File path required', { status: 400 });
    }

    const relativePath = toStorageRelative(filePathArray.map((s) => decodeURIComponent(s)));

    if (!relativePath) {
      return new NextResponse('File path required', { status: 400 });
    }

    // Resolve and confirm the result stays inside storage/, so a crafted
    // path can never reach the rest of the filesystem.
    const absolutePath = path.resolve(STORAGE_ROOT, relativePath);
    if (absolutePath !== STORAGE_ROOT && !absolutePath.startsWith(STORAGE_ROOT + path.sep)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return new NextResponse('File not found', { status: 404 });
    }

    const size = fs.statSync(absolutePath).size;
    const rangeHeader = request.headers.get('range');

    // Honour Range requests so scrubbing works and the browser stops
    // aborting full-body responses it never asked for.
    if (rangeHeader) {
      const range = parseRange(rangeHeader, size);

      if (!range) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` },
        });
      }

      const stream = fs.createReadStream(absolutePath, { start: range.start, end: range.end });

      return new NextResponse(toWebStream(stream), {
        status: 206,
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    return new NextResponse(toWebStream(fs.createReadStream(absolutePath)), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Error reading audio file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
