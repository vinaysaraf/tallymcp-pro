import { writeFile, rename, open } from "node:fs/promises";

/**
 * Write `content` to `path` atomically: writes to `<path>.tmp`, fsyncs, then
 * renames over. A crash mid-write cannot leave a half-written `path`.
 */
export async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, { encoding: "utf8" });
  // fsync to ensure the data is on disk before the rename.
  const fd = await open(tmp, "r+");
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
  await rename(tmp, path);
}
