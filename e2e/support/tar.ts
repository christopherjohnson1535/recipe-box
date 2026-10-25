// A tiny tar writer (ustar), so tests can build archives the backup script would never make: unsafe members, files that
// cannot be unpacked, odd permissions. Independent of the tar on the machine (GNU, BSD or busybox).

export type TarEntry = {
  name: string;
  /** file (default), dir, symlink, hardlink or char (a device). */
  type?: "file" | "dir" | "symlink" | "hardlink" | "char";
  data?: Buffer | string;
  /** Target of a symlink or hardlink. */
  link?: string;
  mode?: number;
};

const TYPE_FLAG = { file: "0", dir: "5", symlink: "2", hardlink: "1", char: "3" } as const;

function field(buf: Buffer, offset: number, length: number, value: string) {
  buf.write(value.slice(0, length), offset, "latin1");
}

function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

export function makeTar(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const type = e.type ?? "file";
    const data = type === "file" ? Buffer.from(e.data ?? "") : Buffer.alloc(0);
    const header = Buffer.alloc(512);
    if (e.name.length > 100) throw new Error(`tar name too long for this writer: ${e.name}`);
    field(header, 0, 100, e.name);
    field(header, 100, 8, octal(e.mode ?? (type === "dir" ? 0o755 : 0o644), 8));
    field(header, 108, 8, octal(0, 8));
    field(header, 116, 8, octal(0, 8));
    field(header, 124, 12, octal(data.length, 12));
    field(header, 136, 12, octal(0, 12)); // mtime: fixed, so archives are reproducible
    header.fill(0x20, 148, 156); // checksum field counts as spaces while summing
    header.write(TYPE_FLAG[type], 156, "latin1");
    if (e.link) field(header, 157, 100, e.link);
    field(header, 257, 6, "ustar\0");
    field(header, 263, 2, "00");
    let sum = 0;
    for (const b of header) sum += b;
    field(header, 148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
    parts.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
