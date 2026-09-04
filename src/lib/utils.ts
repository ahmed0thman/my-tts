import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Prisma persists GenerationStatus as an uppercase enum (PENDING, PROCESSING,
 * COMPLETED, FAILED). The UI was comparing against lowercase literals, so a
 * finished generation never matched and stayed stuck on "جاري المعالجة" with
 * its player hidden. Normalise once, compare everywhere through this.
 */
export type GenerationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export function normalizeStatus(status: unknown): GenerationStatus {
  const value = String(status ?? '').toUpperCase();
  return value === 'COMPLETED' || value === 'FAILED' || value === 'PROCESSING'
    ? (value as GenerationStatus)
    : 'PENDING';
}

export const STATUS_LABELS: Record<GenerationStatus, string> = {
  PENDING: 'في الانتظار',
  PROCESSING: 'قيد المعالجة',
  COMPLETED: 'مكتمل',
  FAILED: 'فشل',
};

/**
 * Event name shared by the header trigger and the onboarding tour. These were
 * two different string literals ('start-namaa-tour' vs 'namaa:open-tour'), so
 * the header's tour button silently did nothing.
 */
export const TOUR_EVENT = 'namaa:open-tour';
