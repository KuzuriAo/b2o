import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

/**
 * Moves `filePath` into `archiveDir` after a fully successful conversion --
 * the recommended workflow when it fits (see the --watch design notes):
 * the archive dir becomes the record of what's already been handled, so
 * there's nothing left in the watched folder to ever re-scan, re-unzip, or
 * consult a state file for.
 *
 * Collision-safe: never silently overwrites an earlier archived original
 * that happens to share a name (e.g. the same filename dropped in twice on
 * different days). Atomic where possible -- a same-filesystem rename, so
 * there's no window where the file could appear duplicated or lost; only
 * falls back to copy-then-delete across filesystems (EXDEV), and only
 * removes the original once the copy has fully completed.
 */
export function archiveOriginal(filePath: string, archiveDir: string): string {
  mkdirSync(archiveDir, { recursive: true });
  const dest = uniqueDestination(filePath, archiveDir);
  try {
    renameSync(filePath, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    copyFileSync(filePath, dest);
    unlinkSync(filePath);
  }
  return dest;
}

function uniqueDestination(filePath: string, archiveDir: string): string {
  const resolvedDir = resolve(archiveDir);
  const ext = extname(filePath);
  const base = basename(filePath, ext);

  let candidate = join(resolvedDir, `${base}${ext}`);
  for (let n = 1; existsSync(candidate); n++) {
    candidate = join(resolvedDir, `${base}-${n}${ext}`);
  }
  return candidate;
}
