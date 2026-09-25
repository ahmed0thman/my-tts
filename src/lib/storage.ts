import fs from 'fs/promises';
import path from 'path';

/**
 * `storage/` sits next to the project, not next to the server.
 *
 * In development those are the same directory and `process.cwd()` is right. In
 * the packaged desktop app they are not: the Next server runs from inside
 * Sawtak.app, while storage/ stays in the data root alongside the Python
 * engine and the database. Server-only.
 */
export const STORAGE_ROOT = path.join(process.env.SAWTAK_DATA_ROOT || process.cwd(), 'storage');

/**
 * Remove a generated file given the path the database holds for it
 * (`/storage/audio/gen_x.wav`). Missing files are fine — the row is what
 * matters — and anything that resolves outside storage/ is ignored.
 */
export async function deleteStoredAudio(storedPath: string | null | undefined): Promise<void> {
  if (!storedPath) return;
  const relative = storedPath.replace(/^\/?storage\//, '');
  const absolute = path.resolve(STORAGE_ROOT, relative);
  if (!absolute.startsWith(STORAGE_ROOT + path.sep)) return;
  try {
    await fs.unlink(absolute);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn(`Could not delete audio file: ${storedPath}`, error);
  }
}
