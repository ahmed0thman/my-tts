'use server';

import { prisma } from '@/lib/prisma';

/**
 * What the audio editor is opening: one segment's take, or an episode's
 * merged file. Saving goes through the /api/edits Route Handler instead of an
 * action — an episode's WAV can be far past the Server Action body limit.
 */

export type EditKind = 'segment' | 'episode';

export interface EditTarget {
  kind: EditKind;
  id: string;
  audioPath: string;
  title: string;
  subtitle: string;
  backHref: string;
  editedAt: Date | null;
  /**
   * Which version is open, for the header: a file saved from the editor, or
   * the one the engine made (the merge / the render). Shown so a fresh merge
   * is never mistaken for an older edited one.
   */
  version: { edited: boolean; at: Date | null };
}

export async function getEditTarget(kind: EditKind, id: string) {
  try {
    if (kind === 'segment') {
      const row = await prisma.generation.findUnique({
        where: { id },
        include: { episode: { select: { id: true, title: true, projectId: true } } },
      });
      if (!row?.audioPath || row.status !== 'COMPLETED') {
        return { success: false as const, error: 'المقطع ده مفيهوش صوت يتعدّل' };
      }
      const data: EditTarget = {
        kind,
        id,
        audioPath: row.audioPath,
        title: row.text,
        subtitle: row.episode ? row.episode.title : 'مقطع من الاستوديو',
        backHref: row.episode ? `/projects/${row.episode.projectId}/episodes/${row.episode.id}` : '/history',
        editedAt: row.editedAt,
        version: { edited: !!row.editedAt, at: row.editedAt },
      };
      return { success: true as const, data };
    }

    const episode = await prisma.episode.findUnique({
      where: { id },
      include: { project: { select: { title: true } } },
    });
    if (!episode?.mergedAudioPath) {
      return { success: false as const, error: 'الحلقة لسه ماتدمجتش' };
    }
    const data: EditTarget = {
      kind,
      id,
      audioPath: episode.mergedAudioPath,
      title: episode.title,
      subtitle: `${episode.project.title} — الملف المدموج`,
      backHref: `/projects/${episode.projectId}/episodes/${episode.id}`,
      editedAt: episode.mergedEditedAt,
      version: { edited: !!episode.mergedEditedAt, at: episode.mergedEditedAt ?? episode.mergedAt },
    };
    return { success: true as const, data };
  } catch (error: any) {
    return { success: false as const, error: error?.message || 'حصل خطأ غير متوقع' };
  }
}
