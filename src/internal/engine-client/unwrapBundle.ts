import { unzipSync } from "fflate";
import { PROJECT_SETTINGS_PATH } from "./paths.js";

export interface BundleEntry {
  /** Display/output filename -- the entry's own basename, directory prefixes stripped. */
  name: string;
  bytes: Uint8Array;
}

/**
 * Detects whether raw file bytes are a single 3MF (returns `null` --
 * caller should treat the bytes as-is, unchanged) or a zip bundling
 * several 3MFs as sibling entries (returns each nested .3mf's own raw
 * bytes) -- e.g. a "download all variants" zip some creator marketplaces
 * already produce (AMS.3mf + SPLIT.3mf inside one bundle.zip, handed to
 * bambu2orca via a partner handoff, or just dropped in by hand).
 *
 * A single 3MF is itself a zip archive with Metadata/project_settings.config
 * at its root -- that presence is exactly what distinguishes the two
 * shapes, since a bundle zip has no project_settings.config of its own,
 * only nested .3mf entries that each have theirs.
 *
 * @returns nested entries if this is a bundle, `null` if it's a plain
 *   3MF (including "not a zip at all" and "a zip with no .3mf entries" --
 *   both cases are left for `prepareConvertRequest` to raise its own
 *   clear error on, rather than this function guessing).
 */
export function unwrapIfBundle(fileBytes: Uint8Array): BundleEntry[] | null {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(fileBytes);
  } catch {
    return null;
  }

  if (Object.hasOwn(entries, PROJECT_SETTINGS_PATH)) {
    return null;
  }

  const nested = Object.entries(entries).filter(([name]) => name.toLowerCase().endsWith(".3mf"));
  if (nested.length === 0) return null;

  return nested.map(([path, bytes]) => ({ name: path.split("/").pop() || path, bytes }));
}
