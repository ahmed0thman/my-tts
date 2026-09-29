import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { importAudio } from '@/lib/tts-client';
import { deleteStoredAudio } from '@/lib/storage';

/**
 * Save audio edited in the in-app editor over a segment's take or an
 * episode's merged file.
 *
 * A Route Handler rather than a Server Action, for size: the editor exports
 * float32 at the browser's rate (usually 44.1 kHz), so ten minutes of episode
 * is ~100 MB — far past `serverActions.bodySizeLimit`, and raising that limit
 * would raise it for every action.
 *
 * `expectedAudioPath` is the file the editor opened. If the row points
 * somewhere else by now — a regenerate, a re-merge, a save from another
 * window — the save is refused rather than silently replacing that newer
 * audio.
 *
 * Order matters: the engine writes a *new* file, the row is switched to it,
 * and only then is the old file deleted, so a failure at any step leaves a
 * row that still plays.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const kind = form.get('kind');
  const id = form.get('id');
  const expectedAudioPath = form.get('expectedAudioPath');
  const file = form.get('file');
  if ((kind !== 'segment' && kind !== 'episode') || typeof id !== 'string' || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing kind, id or file' }, { status: 400 });
  }

  const stale = NextResponse.json(
    { error: 'الصوت ده اتغيّر من مكان تاني بعد ما فتحته في المحرر. افتحه من جديد عشان متمسحش التغيير ده.' },
    { status: 409 },
  );

  try {
    if (kind === 'segment') {
      const row = await prisma.generation.findUnique({ where: { id } });
      if (!row?.audioPath) return NextResponse.json({ error: 'المقطع مش موجود' }, { status: 404 });
      if (row.audioPath !== expectedAudioPath) return stale;

      const result = await importAudio({ file, kind });
      const updated = await prisma.generation.update({
        where: { id },
        data: {
          audioPath: result.audio_path,
          savedPath: result.saved_path,
          duration: result.duration,
          fileSize: result.file_size,
          editedAt: new Date(),
        },
      });
      await deleteStoredAudio(row.audioPath);
      revalidatePath('/');
      return NextResponse.json({ audioPath: updated.audioPath, duration: updated.duration });
    }

    const episode = await prisma.episode.findUnique({
      where: { id },
      include: { project: { select: { title: true } } },
    });
    if (!episode?.mergedAudioPath) return NextResponse.json({ error: 'الحلقة مش موجودة' }, { status: 404 });
    if (episode.mergedAudioPath !== expectedAudioPath) return stale;

    const result = await importAudio({
      file,
      kind,
      outputDir: episode.outputDir || undefined,
      filenameHint: `${episode.project.title} - ${episode.title}`,
    });
    const updated = await prisma.episode.update({
      where: { id },
      data: {
        mergedAudioPath: result.audio_path,
        mergedSavedPath: result.saved_path,
        mergedDuration: result.duration,
        mergedEditedAt: new Date(),
      },
    });
    await deleteStoredAudio(episode.mergedAudioPath);
    revalidatePath('/projects');
    return NextResponse.json({ audioPath: updated.mergedAudioPath, duration: updated.mergedDuration });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'فشل حفظ التعديل' }, { status: 500 });
  }
}
