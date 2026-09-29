import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { importToStorage } from '@/lib/clips';
import { clipNameSchema } from '@/lib/validations';

/**
 * Save an uploaded or recorded clip to the library.
 *
 * A Route Handler rather than a Server Action for size, like /api/edits: a
 * few minutes of recording is past `serverActions.bodySizeLimit`.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = form.get('file');
  const source = form.get('source') === 'recording' ? 'recording' : 'upload';
  const name = clipNameSchema.safeParse(form.get('name'));
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'مفيش ملف' }, { status: 400 });
  if (!name.success) return NextResponse.json({ error: name.error.errors[0].message }, { status: 400 });

  try {
    const stored = await importToStorage(file, 'clips');
    const clip = await prisma.clip.create({
      data: { name: name.data, source, audioPath: stored.audioPath, duration: stored.duration, fileSize: stored.fileSize },
    });
    revalidatePath('/library');
    return NextResponse.json(clip);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'فشل حفظ المقطع' }, { status: 500 });
  }
}
