import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const buildDir = path.join(rootDir, 'build');
const pngDir = path.join(buildDir, 'icons');
const iconsetDir = path.join(buildDir, 'icon.iconset');
const sourcePath = path.join(buildDir, 'icon.svg');

const pngSizes = [16, 32, 64, 128, 256, 512, 1024];
const icoSizes = [16, 32, 48, 64, 256];
const iconsetFiles = new Map([
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]);
const icnsElements = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic13', 256],
  ['ic09', 512],
  ['ic14', 512],
  ['ic10', 1024],
];

async function renderPng(svg, size) {
  return sharp(svg, { density: 1024 })
    .resize(size, size, { fit: 'fill' })
    .withMetadata({ density: 72 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function buildIco(images) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const dataOffset = headerSize + directoryEntrySize * images.length;
  const header = Buffer.alloc(dataOffset);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = dataOffset;
  images.forEach(({ size, png }, index) => {
    const entry = headerSize + index * directoryEntrySize;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

function buildIcns(pngs) {
  const elements = icnsElements.map(([type, size]) => {
    const png = pngs.get(size);
    const element = Buffer.alloc(8 + png.length);
    element.write(type, 0, 4, 'ascii');
    element.writeUInt32BE(element.length, 4);
    png.copy(element, 8);
    return element;
  });
  const totalSize = 8 + elements.reduce((sum, element) => sum + element.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalSize, 4);
  return Buffer.concat([header, ...elements]);
}

async function hasIconutil() {
  if (process.platform !== 'darwin') return false;

  try {
    await access('/usr/bin/iconutil', constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const svg = await readFile(sourcePath);
  await mkdir(pngDir, { recursive: true });
  await rm(iconsetDir, { recursive: true, force: true });

  const pngs = new Map();
  for (const size of [...new Set([...pngSizes, ...icoSizes])]) {
    pngs.set(size, await renderPng(svg, size));
  }

  for (const size of pngSizes) {
    const outputPath = path.join(pngDir, `icon-${size}.png`);
    await writeFile(outputPath, pngs.get(size));
    console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
  }

  const linuxPath = path.join(buildDir, 'icon.png');
  await writeFile(linuxPath, pngs.get(512));
  console.log(`Wrote ${path.relative(rootDir, linuxPath)}`);

  const icoPath = path.join(buildDir, 'icon.ico');
  await writeFile(
    icoPath,
    buildIco(icoSizes.map((size) => ({ size, png: pngs.get(size) }))),
  );
  console.log(`Wrote ${path.relative(rootDir, icoPath)} (${icoSizes.join(', ')}px)`);

  try {
    await mkdir(iconsetDir, { recursive: true });
    for (const [filename, size] of iconsetFiles) {
      await writeFile(path.join(iconsetDir, filename), pngs.get(size));
    }

    if (await hasIconutil()) {
      const icnsPath = path.join(buildDir, 'icon.icns');
      const result = spawnSync(
        '/usr/bin/iconutil',
        ['-c', 'icns', iconsetDir, '-o', icnsPath],
        { cwd: rootDir, encoding: 'utf8' },
      );
      if (result.status === 0) {
        console.log('Wrote build/icon.icns');
      } else {
        const detail = result.stderr.trim() || `exit status ${result.status}`;
        console.warn(`iconutil could not assemble the iconset (${detail}); using PNG-based ICNS fallback.`);
        await writeFile(
          icnsPath,
          buildIcns(pngs),
        );
        console.log('Wrote build/icon.icns (fallback)');
      }
    } else {
      console.log('Skipped build/icon.icns: iconutil is only available on macOS.');
    }
  } finally {
    await rm(iconsetDir, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  await rm(iconsetDir, { recursive: true, force: true }).catch(() => {});
  console.error(`Icon generation failed: ${error.message}`);
  process.exitCode = 1;
});
