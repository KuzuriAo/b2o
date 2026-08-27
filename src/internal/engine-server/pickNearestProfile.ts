/** A candidate profile to fuzzy-match against, as returned by a D1 listing query. */
export interface ProfileCandidate {
  id: string;
  layerHeight: number;
}

export interface PickNearestProfileResult {
  profileId: string;
  /** True when a candidate's layerHeight matched the target exactly. */
  exact: boolean;
}

/**
 * Picks the candidate whose layerHeight is closest to the Bambu source's
 * own detected layer height. Ties resolve to the first candidate at that
 * distance (candidates should be pre-sorted by layerHeight ascending, so
 * this favors the finer of two equidistant options).
 *
 * Returns `null` when there are no candidates, or when `targetLayerHeight`
 * is null (unparseable/missing on the Bambu source) -- callers should fall
 * back to a default profile in that case rather than guess.
 */
export function pickNearestProfile(candidates: ProfileCandidate[], targetLayerHeight: number | null): PickNearestProfileResult | null {
  if (candidates.length === 0 || targetLayerHeight === null) return null;

  let best = candidates[0];
  let bestDistance = Math.abs(candidates[0].layerHeight - targetLayerHeight);
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(candidate.layerHeight - targetLayerHeight);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return { profileId: best.id, exact: bestDistance < 1e-9 };
}
