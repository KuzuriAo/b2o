/**
 * Return `{objectid: [tx, ty]}` for every top-level `<item>` in `<build>`
 * whose transform has exactly 12 tokens.
 *
 * Ported from `parse_item_positions` in bbs2u1.py (lines 470-478).
 */
export function parseItemPositions(modelXmlText: string): Record<string, [number, number]> {
  const positions: Record<string, [number, number]> = {};
  for (const m of modelXmlText.matchAll(/<item objectid="(\d+)"[^>]*transform="([^"]+)"/g)) {
    const oid = m[1];
    const tokens = m[2].split(/\s+/).filter(Boolean);
    if (tokens.length === 12) {
      positions[oid] = [Number(tokens[9]), Number(tokens[10])];
    }
  }
  return positions;
}
