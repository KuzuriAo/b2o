import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ConvertOutcome = "succeeded" | "permanently-failed";

export interface StateRecord {
  fingerprint: string;
  outcome: ConvertOutcome;
}

export type StateFile = Record<string, StateRecord>;

/**
 * `size:mtimeMs` -- identifies a specific version of a file's content, not
 * just its name. Deliberately more than just size: two versions of a file
 * can be exactly the same number of bytes (e.g. a plate renamed "Core
 * pieces" -> "Core Pieces") while genuinely differing in content, and
 * mtime is what catches that. Cheap to compute -- one stat() call, already
 * needed elsewhere for the same file.
 */
export function computeFingerprint(path: string): string {
  const stat = statSync(path);
  return `${stat.size}:${stat.mtimeMs}`;
}

function stateFilePath(dir: string): string {
  return join(dir, ".b2o-state.json");
}

/** Missing or corrupt state file both resolve to "nothing recorded yet" -- a long-running watch session shouldn't crash over a hand-edited or truncated bookkeeping file. */
export function loadStateFile(dir: string): StateFile {
  const path = stateFilePath(dir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as StateFile;
  } catch {
    return {};
  }
}

export function saveStateFile(dir: string, state: StateFile): void {
  writeFileSync(stateFilePath(dir), JSON.stringify(state, null, 2));
}
