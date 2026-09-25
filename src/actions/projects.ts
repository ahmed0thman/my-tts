'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { deleteStoredAudio } from '@/lib/storage';
import { mergeSignature } from '@/lib/projects';
import { projectSchema } from '@/lib/validations';

/**
 * Projects are containers: a channel, a series, a client. They hold episodes
 * (src/actions/episodes.ts) and have no audio of their own.
 */

function fail(error: any, fallback = 'حصل خطأ غير متوقع') {
  return { success: false as const, error: error?.errors?.[0]?.message || error?.message || fallback };
}

type SegmentSummary = { id: string; status: string; duration: number | null; audioPath: string | null };

/** Counts and state for an episode card, from its segments. */
function summarizeEpisode<E extends { mergedAudioPath: string | null; mergedSignature: string | null }>(
  episode: E & { segments: SegmentSummary[] },
) {
  const { segments, ...rest } = episode;
  return {
    ...rest,
    segmentCount: segments.length,
    completedCount: segments.filter((s) => s.status === 'COMPLETED').length,
    failedCount: segments.filter((s) => s.status === 'FAILED').length,
    renderedDuration: segments.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    mergeIsCurrent: !!rest.mergedAudioPath && rest.mergedSignature === mergeSignature(segments),
  };
}

const SEGMENT_SUMMARY = {
  orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
  select: { id: true, status: true, duration: true, audioPath: true },
};

export async function getProjects() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        episodes: {
          select: { mergedAudioPath: true, updatedAt: true, _count: { select: { segments: true } } },
        },
      },
    });

    const data = projects.map(({ episodes, ...project }) => ({
      ...project,
      episodeCount: episodes.length,
      mergedCount: episodes.filter((e) => e.mergedAudioPath).length,
      segmentCount: episodes.reduce((sum, e) => sum + e._count.segments, 0),
      // Work happens in episodes; the project is as recent as its latest one.
      lastActivity: episodes.reduce((latest, e) => (e.updatedAt > latest ? e.updatedAt : latest), project.updatedAt),
    }));
    data.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    return { success: true as const, data };
  } catch (error) {
    return fail(error);
  }
}

export async function getProject(id: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { createdAt: 'desc' },
          include: { segments: SEGMENT_SUMMARY },
        },
      },
    });
    if (!project) return { success: false as const, error: 'المشروع مش موجود' };

    return {
      success: true as const,
      data: { ...project, episodes: project.episodes.map(summarizeEpisode) },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function createProject(input: { title: string; description?: string }) {
  try {
    const data = projectSchema.parse(input);
    const project = await prisma.project.create({
      data: { title: data.title, description: data.description || null },
    });
    revalidatePath('/projects');
    return { success: true as const, data: project };
  } catch (error) {
    return fail(error);
  }
}

export async function updateProject(id: string, input: { title: string; description?: string }) {
  try {
    const data = projectSchema.parse(input);
    const project = await prisma.project.update({
      where: { id },
      data: { title: data.title, description: data.description || null },
    });
    revalidatePath('/projects');
    return { success: true as const, data: project };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Deletes the project, its episodes, every segment row, and all of their audio
 * in storage/ — merged files included. Copies exported to the user's own
 * folders are theirs and are left alone.
 */
export async function deleteProject(id: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        episodes: { select: { mergedAudioPath: true, segments: { select: { audioPath: true } } } },
      },
    });
    if (!project) return { success: false as const, error: 'المشروع مش موجود' };

    // Rows cascade with the project; the files do not.
    await prisma.project.delete({ where: { id } });
    await Promise.all(
      project.episodes.flatMap((episode) => [
        deleteStoredAudio(episode.mergedAudioPath),
        ...episode.segments.map((s) => deleteStoredAudio(s.audioPath)),
      ]),
    );

    revalidatePath('/projects');
    return { success: true as const };
  } catch (error) {
    return fail(error);
  }
}
