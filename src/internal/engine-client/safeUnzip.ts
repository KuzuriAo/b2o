import { unzipSync, type Unzipped } from "fflate";

/**
 * Defeats a classic decompression-bomb .3mf (a tiny compressed file whose
 * zip central directory *declares* a huge uncompressed size) -- fflate's
 * `filter` callback runs against each entry's declared size, read straight
 * from the zip's central directory, BEFORE that entry is actually
 * inflated, so an oversized claim is rejected up front rather than after
 * the expensive decompression already happened. This matters because
 * .3mf parsing runs entirely client-side (browser tab or the `b2o` CLI
 * process) on whoever converts the file, not on bambu2orca's own server --
 * a malicious file shared on a creator site would otherwise crash/hang
 * the *victim's* machine, not attacker infrastructure.
 *
 * The actual signature of a bomb is an absurd COMPRESSION RATIO, not a
 * large absolute size -- a single DEFLATE stream tops out near ~1032:1
 * even on maximally-repetitive input, so a small compressed file claiming
 * gigabytes is only achievable by a crafted bomb, never real data. A
 * previous version of this check used a flat 500MB total-uncompressed
 * cap instead, unverified against any real large 3MF -- it rejected a
 * genuine 55-object multi-plate model (563MB uncompressed from a 98MB
 * file, a perfectly ordinary ~5.7:1 ratio) as if it were an attack.
 * MAX_COMPRESSION_RATIO catches the real signature; the absolute caps
 * below are now just a generous backstop against a single entry/archive
 * being too large to handle regardless of how honestly it compresses.
 */
const MAX_COMPRESSION_RATIO = 100;
// Ratio math is noisy/meaningless on small entries (a 50-byte file
// expanding to 5KB is "100:1" but harmless) -- only entries at least this
// large uncompressed are worth ratio-checking at all.
const MIN_UNCOMPRESSED_BYTES_FOR_RATIO_CHECK = 10 * 1024 * 1024; // 10MB
const MAX_ENTRY_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // 2GB per entry
const MAX_TOTAL_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 * 1024; // 4GB across the whole archive
const MAX_ENTRY_COUNT = 10_000;

export function safeUnzipSync(fileBytes: Uint8Array): Unzipped {
  let totalBytes = 0;
  let entryCount = 0;

  return unzipSync(fileBytes, {
    filter(file) {
      entryCount++;
      if (entryCount > MAX_ENTRY_COUNT) {
        throw new Error(`This file has too many entries (limit: ${MAX_ENTRY_COUNT}) -- refusing to unzip it.`);
      }
      if (file.originalSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
        throw new Error(
          `"${file.name}" claims to be ${file.originalSize} bytes uncompressed, over the ${MAX_ENTRY_UNCOMPRESSED_BYTES} byte per-file limit -- refusing to unzip it.`,
        );
      }
      if (file.originalSize >= MIN_UNCOMPRESSED_BYTES_FOR_RATIO_CHECK) {
        const ratio = file.size > 0 ? file.originalSize / file.size : Infinity;
        if (ratio > MAX_COMPRESSION_RATIO) {
          throw new Error(
            `"${file.name}" compresses at ${ratio.toFixed(0)}:1 (${file.size} -> ${file.originalSize} bytes), over the ${MAX_COMPRESSION_RATIO}:1 limit -- shaped like a decompression bomb, refusing to unzip it.`,
          );
        }
      }
      totalBytes += file.originalSize;
      if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error(
          `This file's total uncompressed size exceeds the ${MAX_TOTAL_UNCOMPRESSED_BYTES} byte limit -- refusing to unzip it.`,
        );
      }
      return true;
    },
  });
}
