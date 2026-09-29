import fs from 'fs/promises';
import { crc32 } from 'zlib';

/**
 * Minimal store-only ZIP writer. WAV barely compresses, so there is no point
 * paying for deflate — and no dependency for it. Server-only.
 *
 * Yields the archive in chunks, holding one file in memory at a time. No
 * ZIP64: the caller refuses totals near 4 GB before starting.
 */
export interface ZipEntry {
  /** Name inside the archive (UTF-8). */
  name: string;
  /** Absolute path of the file to store. */
  path: string;
}

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export async function* zipEntries(entries: ZipEntry[]): AsyncGenerator<Uint8Array> {
  const central: Buffer[] = [];
  const { time, day } = dosDateTime(new Date());
  let offset = 0;

  for (const entry of entries) {
    const data = await fs.readFile(entry.path);
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(data);

    // Bit 11 of the flags marks the name as UTF-8 — the names are Arabic.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    yield local;
    yield name;
    yield data;
    offset += local.length + name.length + data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  yield directory;
  yield end;
}
