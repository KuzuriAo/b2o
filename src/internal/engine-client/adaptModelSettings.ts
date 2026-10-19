/**
 * Orca's model_settings.config matches Bambu's schema except for two things:
 *
 * 1. It doesn't carry a `filament_volume_maps` metadata entry. Strip that
 *    line if present.
 * 2. Bambu stores some per-object overrides (inner_wall_speed,
 *    sparse_infill_speed, ...) as one value per extruder variant, with `nil`
 *    for "not set", e.g. `value="50,nil"` (Standard, High Flow). Snorca 2.4.0
 *    can't read a `nil` there and refuses the whole file ("Deserializing nil
 *    into a non-nullable object"). Orca wants a single value, and the U1 only
 *    ever prints with one nozzle at a time, so take the first entry. A first
 *    entry that is itself `nil` means no override, so the line goes.
 *
 * Everything else (plates, plate names, print sequence, thumbnail refs,
 * assemble block) is left untouched.
 *
 * Ported from `adapt_model_settings` in bbs2u1.py, which carries the same
 * rules. Operates on already-decoded text rather than bytes -- unlike the
 * Python original, byte encoding/decoding happens once at the actual zip I/O
 * boundary in this port, not per-function.
 */
const METADATA_LINE = /^(\s*<metadata\s+key="[^"]+"\s+value=")([^"]*)("\s*\/>.*)$/s;
// Only numbers, percentages and `nil` count as an override list, so a
// free-text value (an object name containing a comma, say) is never touched.
const NUMBER_OR_NIL = /^(?:nil|-?\d+(?:\.\d+)?%?)$/;

/** The line with its per-variant value list collapsed, null to drop it, or the line itself if it needs nothing. */
function collapseNilList(line: string): string | null {
  const match = METADATA_LINE.exec(line);
  if (!match) return line;
  const entries = match[2].split(",");
  if (!entries.includes("nil") || !entries.every((entry) => NUMBER_OR_NIL.test(entry.trim()))) return line;
  const first = entries[0].trim();
  return first === "nil" ? null : `${match[1]}${first}${match[3]}`;
}

export function adaptModelSettings(bambuXmlText: string): string {
  // Split on "\n" but re-append it to every piece except a trailing one with
  // no newline, matching Python's splitlines(keepends=True) for LF/CRLF text.
  const parts = bambuXmlText.split("\n");
  const lines = parts.map((part, i) => (i < parts.length - 1 ? `${part}\n` : part));
  const adapted: string[] = [];
  for (const line of lines) {
    if (line.includes('key="filament_volume_maps"')) continue;
    const collapsed = collapseNilList(line);
    if (collapsed !== null) adapted.push(collapsed);
  }
  return adapted.join("");
}
