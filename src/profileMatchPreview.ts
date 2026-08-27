import { detectNozzleDiameter, parseTierName, pickProfile } from "./internal/engine-server/index.js";
import type { ProjectSettings } from "./internal/shared/index.js";
import { listProfiles } from "./convertClient.js";

export interface ProfileMatchPreview {
  profileId: string;
  nozzleDiameter: string;
  exact: boolean;
  matchedByTierName: boolean;
  matchSource: "auto-tier-name" | "auto-exact" | "auto-nearest" | "default-fallback";
}

function detectLayerHeight(projectSettings: ProjectSettings): number | null {
  const raw = projectSettings.layer_height;
  const value = typeof raw === "string" ? Number.parseFloat(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(value) ? value : null;
}

function detectTierName(projectSettings: ProjectSettings): string | null {
  const raw = projectSettings.print_settings_id;
  return typeof raw === "string" ? parseTierName(raw) : null;
}

/**
 * Client-side replica of what POST /v1/convert's own auto-selection would
 * pick, so --dry-run can preview it (and warn on a poor match) without
 * spending a real conversion against the rate-limited endpoint. Only
 * imports engine-server's pure, mesh-free matching functions (never
 * runConvertPipeline) -- this does NOT make full offline conversion
 * possible, since the actual template/settings-merge data those functions
 * match against still lives only in D1, fetched here read-only via the
 * same public GET /v1/profiles the `b2o profiles` command already uses.
 */
export async function previewProfileMatch(projectSettings: ProjectSettings, baseUrl: string): Promise<ProfileMatchPreview> {
  const nozzleDiameter = detectNozzleDiameter(projectSettings);
  if (!nozzleDiameter) {
    return { profileId: "", nozzleDiameter: "", exact: false, matchedByTierName: false, matchSource: "default-fallback" };
  }

  const { profiles } = await listProfiles(nozzleDiameter, baseUrl);
  const candidates = profiles.map((p) => ({ id: p.id, layerHeight: p.layerHeight, tierName: p.tierName, autoSelectable: p.autoSelectable }));
  const picked = pickProfile(candidates, {
    layerHeight: detectLayerHeight(projectSettings),
    tierName: detectTierName(projectSettings),
  });

  if (!picked) {
    return { profileId: "", nozzleDiameter, exact: false, matchedByTierName: false, matchSource: "default-fallback" };
  }

  return {
    profileId: picked.profileId,
    nozzleDiameter,
    exact: picked.exact,
    matchedByTierName: picked.matchedByTierName,
    matchSource: picked.matchedByTierName ? "auto-tier-name" : picked.exact ? "auto-exact" : "auto-nearest",
  };
}
