import { normalizeTierName } from "./parseTierName.js";
import { pickNearestProfile, type PickNearestProfileResult, type ProfileCandidate } from "./pickNearestProfile.js";

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
 * Picks a profile for a detected nozzle diameter, preferring the source's
 * own tier name (parsed from its print_settings_id, e.g. "Extra Fine" out
 * of "0.08mm Extra Fine @BBL X1C") over pure nearest-layer-height
 * matching. This is what disambiguates ties that layer height alone
 * can't -- e.g. "0.08 Extra Fine" and "0.08 High Quality" @0.4mm sit at
 * the identical layer height, but only one shares the source file's own
 * tier name.
 *
 * Two stages:
 * 1. If `targetTierName` is provided, filter candidates to ones whose
 *    `tierName` matches it (case/whitespace-insensitive), *ignoring*
 *    `autoSelectable` -- a direct name match is a stronger signal than
 *    the tie-break table `autoSelectable` encodes, so it's allowed to
 *    pick a normally-non-auto-selectable tier. Among matches, nearest by
 *    layer height. The result is only trusted if it's at least as good a
 *    layer-height fit as the best name-agnostic candidate (see
 *    {@link isTierNameMatchTrustworthy}) -- this is what catches a
 *    cross-vendor naming coincidence (confirmed on a real Creality Print
 *    export: its own "Standard" tier was 0.12mm, but Snapmaker's own
 *    "Standard" tier is 0.20mm -- the shared word doesn't mean the same
 *    layer height once the source isn't Bambu Studio). A genuine Bambu
 *    source's tier name always ties or wins this check by construction,
 *    so this doesn't change behavior for the case the check was
 *    originally built for.
 * 2. Otherwise (no tier name, no candidate shares it, or the name match
 *    isn't trustworthy), fall back to `pickNearestProfile` restricted to
 *    `autoSelectable` candidates only -- unchanged from the original
 *    layer-height-only behavior.
 *
 * Returns `null` when there are no candidates at all, or `targetLayerHeight`
 * is null with no tier-name match either.
 */
export function pickProfile(
  candidates: TierAwareProfileCandidate[],
  target: { layerHeight: number | null; tierName: string | null },
): PickProfileResult | null {
  const autoSelectableCandidates = candidates.filter((c) => c.autoSelectable);
  const nearestByHeight = pickNearestProfile(autoSelectableCandidates, target.layerHeight);

  if (target.tierName) {
    const normalizedTarget = normalizeTierName(target.tierName);
    const nameMatches = candidates.filter((c) => normalizeTierName(c.tierName) === normalizedTarget);
    const pickedByName = pickNearestProfile(nameMatches, target.layerHeight ?? nameMatches[0]?.layerHeight ?? null);
    if (pickedByName && isTierNameMatchTrustworthy(pickedByName, nearestByHeight, candidates, target.layerHeight)) {
      return { ...pickedByName, matchedByTierName: true };
    }
  }

  return nearestByHeight ? { ...nearestByHeight, matchedByTierName: false } : null;
}

/**
 * A tier-NAME match is only trustworthy when its own layer height is at
 * least as close to the target as the best name-agnostic candidate's --
 * i.e. the name match must not be a WORSE layer-height fit than simply
 * ignoring the name entirely. When there's no target layer height (or no
 * name-agnostic candidate) to compare against at all, the name match is
 * trusted unconditionally, matching the original behavior for that edge
 * case.
 */
function isTierNameMatchTrustworthy(
  pickedByName: PickNearestProfileResult,
  nearestByHeight: PickNearestProfileResult | null,
  candidates: TierAwareProfileCandidate[],
  targetLayerHeight: number | null,
): boolean {
  if (targetLayerHeight === null || !nearestByHeight) return true;
  const namedHeight = candidates.find((c) => c.id === pickedByName.profileId)?.layerHeight;
  const nearestHeight = candidates.find((c) => c.id === nearestByHeight.profileId)?.layerHeight;
  if (namedHeight === undefined || nearestHeight === undefined) return true;
  return Math.abs(namedHeight - targetLayerHeight) <= Math.abs(nearestHeight - targetLayerHeight) + 1e-9;
}
