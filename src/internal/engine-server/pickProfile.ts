import { normalizeTierName } from "./parseTierName.js";
import { pickNearestProfile, type ProfileCandidate } from "./pickNearestProfile.js";

/** A candidate profile for tier-aware selection -- a superset of ProfileCandidate. */
export interface TierAwareProfileCandidate extends ProfileCandidate {
  tierName: string;
  autoSelectable: boolean;
}

export interface PickProfileResult {
  profileId: string;
  exact: boolean;
  /** True when the Bambu source's own tier name (e.g. "Extra Fine") matched a candidate's tier name directly. */
  matchedByTierName: boolean;
}

/**
 * Picks a profile for a detected nozzle diameter, preferring the Bambu
 * source's own tier name (parsed from its print_settings_id, e.g. "Extra
 * Fine" out of "0.08mm Extra Fine @BBL X1C") over pure nearest-layer-
 * height matching. This is what disambiguates ties that layer height
 * alone can't -- e.g. "0.08 Extra Fine" and "0.08 High Quality" @0.4mm
 * sit at the identical layer height, but only one shares the source
 * file's own tier name.
 *
 * Two stages:
 * 1. If `targetTierName` is provided, filter candidates to ones whose
 *    `tierName` matches it (case/whitespace-insensitive), *ignoring*
 *    `autoSelectable` -- a direct name match is a stronger signal than
 *    the tie-break table `autoSelectable` encodes, so it's allowed to
 *    pick a normally-non-auto-selectable tier. Among matches, nearest by
 *    layer height (should be exact in practice, but hedges against a
 *    same-name Bambu/Snapmaker tier at a slightly different height).
 * 2. Otherwise (no tier name, or no candidate shares it), fall back to
 *    `pickNearestProfile` restricted to `autoSelectable` candidates only
 *    -- unchanged from the original layer-height-only behavior.
 *
 * Returns `null` when there are no candidates at all, or `targetLayerHeight`
 * is null with no tier-name match either.
 */
export function pickProfile(
  candidates: TierAwareProfileCandidate[],
  target: { layerHeight: number | null; tierName: string | null },
): PickProfileResult | null {
  if (target.tierName) {
    const normalizedTarget = normalizeTierName(target.tierName);
    const nameMatches = candidates.filter((c) => normalizeTierName(c.tierName) === normalizedTarget);
    const picked = pickNearestProfile(nameMatches, target.layerHeight ?? nameMatches[0]?.layerHeight ?? null);
    if (picked) return { ...picked, matchedByTierName: true };
  }

  const autoSelectableCandidates = candidates.filter((c) => c.autoSelectable);
  const picked = pickNearestProfile(autoSelectableCandidates, target.layerHeight);
  return picked ? { ...picked, matchedByTierName: false } : null;
}
