import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { copyStoredAudio, importToStorage, insertSegmentAt, IMPORTED_MODEL_ID } from '@/lib/clips';
import { clipNameSchema } from '@/lib/validations';

/**
 * Add an uploaded file or a recording to an episode as a finished segment, at
 * `position` in the running order (the end when omitted). With
 * `saveToLibrary`, a copy is saved as a library clip too.
 *
 * A Route Handler rather than a Server Action for size — see /api/clips.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: episodeId } = await params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = form.get('file');
  const source = form.get('source') === 'recording' ? 'recording' : 'upload';
  const name = clipNameSchema.safeParse(form.get('name'));
  const rawPosition = form.get('position');
  const position = typeof rawPosition === 'string' && rawPosition !== '' ? Number(rawPosition) : null;
  const saveToLibrary = form.get('saveToLibrary') === '1';
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'مفيش ملف' }, { status: 400 });
  if (!name.success) return NextResponse.json({ error: name.error.errors[0].message }, { status: 400 });

  try {
    const episode = await prisma.episode.findUnique({ where: { id: episodeId }, select: { id: true } });
    if (!episode) return NextResponse.json({ error: 'الحلقة مش موجودة' }, { status: 404 });

    const stored = await importToStorage(file, 'audio');
    const segment = await insertSegmentAt(episodeId, position, {
      text: name.data,
      source,
      modelId: IMPORTED_MODEL_ID,
      status: 'COMPLETED',
      audioPath: stored.audioPath,
      duration: stored.duration,
      fileSize: stored.fileSize,
    });

    if (saveToLibrary) {
      const copy = await copyStoredAudio(stored.audioPath, 'clips');
      await prisma.clip.create({
        data: { name: name.data, source, audioPath: copy.audioPath, duration: stored.duration, fileSize: copy.fileSize },
      });
      revalidatePath('/library');
    }

    revalidatePath('/projects');
    return NextResponse.json({ id: segment.id });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'فشل إضافة الصوت' }, { status: 500 });
  }
}
