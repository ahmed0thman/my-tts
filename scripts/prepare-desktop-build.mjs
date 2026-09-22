/**
 * Records where the packaged app should look for its data.
 *
 * The .app carries the Electron shell and the compiled Next server, but not
 * the Python virtualenv, the database or storage/ — resolveDataRoot() in
 * electron/processes.js explains why each of those has to stay outside a
 * bundle. Something still has to tell the installed app where they are, so the
 * project's own path is written here at build time.
 *
 * This is what makes the build machine-local rather than distributable. A build
 * for another Mac needs a relocatable Python and a data directory created on
 * first run; SAWTAK_DATA_ROOT already overrides this file, which is the seam
 * that change would go through.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'electron', 'data-root.json');

await writeFile(
  target,
  JSON.stringify({ dataRoot: root, generatedAt: new Date().toISOString() }, null, 2) + '\n',
);
console.log(`data root -> ${root}`);
