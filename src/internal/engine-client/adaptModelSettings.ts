/**
 * Orca's model_settings.config matches Bambu's schema except it doesn't
 * carry a `filament_volume_maps` metadata entry. Strip that line if
 * present; leave everything else (plates, plate names, print sequence,
 * thumbnail refs, assemble block) untouched.
 *
 * Ported from `adapt_model_settings` in bbs2u1.py (lines 899-907).
 * Operates on already-decoded text rather than bytes -- unlike the Python
 * original, byte encoding/decoding happens once at the actual zip I/O
 * boundary in this port, not per-function.
 */
export function adaptModelSettings(bambuXmlText: string): string {
  // Split on "\n" but re-append it to every piece except a trailing one with
  // no newline, matching Python's splitlines(keepends=True) for LF/CRLF text.
  const parts = bambuXmlText.split("\n");
  const lines = parts.map((part, i) => (i < parts.length - 1 ? `${part}\n` : part));
  return lines.filter((ln) => !ln.includes('key="filament_volume_maps"')).join("");
}
