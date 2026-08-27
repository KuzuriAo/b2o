/**
 * Extracts the tier name out of a `print_settings_id`/`name`-shaped
 * string, e.g. "0.08mm Extra Fine @BBL X1C" -> "Extra Fine", or our own
 * "0.08 High Quality @Snapmaker U1 (0.4 nozzle)" -> "High Quality". Both
 * Bambu's and Snapmaker's naming follow the same
 * "{layer height}[mm] {tier name} @{printer}" shape, so one parser covers
 * both sides of the match.
 *
 * Returns `null` when the string doesn't fit that shape (missing "@", no
 * text between the number and "@", etc.) -- callers should treat that as
 * "no tier name signal available" rather than guess.
 */
export function parseTierName(text: string): string | null {
  const match = /^[\d.]+(?:mm)?\s+(.+?)\s+@/.exec(text.trim());
  return match ? match[1] : null;
}

/** Case/whitespace-insensitive comparison key for two tier names. */
export function normalizeTierName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
