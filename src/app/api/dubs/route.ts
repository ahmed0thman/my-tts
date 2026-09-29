import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { deleteStoredAudio, STORAGE_ROOT } from '@/lib/storage';
import { probeVideo } from '@/lib/tts-client';
import { dubTitleSchema } from '@/lib/validations';

/**
 * Start a dub from an uploaded video.
 *
 * The body is the file itself (not multipart), streamed straight to
 * storage/videos: a video can be gigabytes, and `request.formData()` would
 * hold all of it in memory. The file name and the dub's title travel in the
 * query string. A Route Handler, since a Server Action has a 12 MB body limit.
 */
export const dynamic = 'force-dynamic';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi'];

export async function POST(request: NextRequest) {
  const fileName = request.nextUrl.searchParams.get('name') ?? '';
  const ext = path.extname(fileName).toLowerCase();
  const title = dubTitleSchema.safeParse(request.nextUrl.searchParams.get('title') || path.basename(fileName, ext));
  if (!VIDEO_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `نوع الملف مش مدعوم — اختار فيديو (${VIDEO_EXTENSIONS.join(' ')})` }, { status: 400 });
  }
  if (!title.success) return NextResponse.json({ error: title.error.errors[0].message }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: 'مفيش ملف' }, { status: 400 });

  const folder = path.join(STORAGE_ROOT, 'videos');
  await fs.promises.mkdir(folder, { recursive: true });
  const name = `src_${randomUUID()}${ext}`;
  const stored = `/storage/videos/${name}`;

  try {
    await pipeline(Readable.fromWeb(request.body as any), fs.createWriteStream(path.join(folder, name)));
    const info = await probeVideo(stored);
    const dub = await prisma.dub.create({
      data: {
        title: title.data,
        videoPath: stored,
        videoName: fileName,
        posterPath: info.poster_path,
        duration: info.duration,
        width: info.width,
        height: info.height,
        hasAudio: info.has_audio,
      },
    });
    revalidatePath('/dubbing');
    return NextResponse.json({ id: dub.id });
  } catch (error: any) {
    await deleteStoredAudio(stored);
    await deleteStoredAudio(stored.replace(/\.[^.]+$/, '.jpg'));
    return NextResponse.json({ error: error?.message || 'فشل رفع الفيديو' }, { status: 500 });
  }
}
