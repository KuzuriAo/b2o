import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prepareConvertRequest } from "./internal/engine-client/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listProfiles } from "./convertClient.js";
import { previewProfileMatch } from "./profileMatchPreview.js";

vi.mock("./convertClient.js", () => ({
  listProfiles: vi.fn(),
}));

function fixturePath(vendor: string): string {
  return fileURLToPath(new URL(`./fixtures/synthetic-${vendor}.3mf`, import.meta.url));
}

// Mirrors the real catalog for the 0.4mm nozzle: "Standard" is 0.20mm,
// "Fine" is 0.12mm -- these are two genuinely different tiers that happen
// to share a name with each vendor's own "Standard" tier at a different
// layer height. See pickProfile.ts's cross-vendor fix.
const REAL_CATALOG_SHAPE = [
  { id: "snapmaker-u1-0.4-standard", displayName: "0.20 Standard @Snapmaker U1 (0.4 nozzle)", printerId: "snapmaker-u1", nozzleDiameter: "0.4", layerHeight: 0.2, autoSelectable: true, tierName: "Standard" },
  { id: "snapmaker-u1-0.4-0.12fin", displayName: "0.12 Fine @Snapmaker U1 (0.4 nozzle)", printerId: "snapmaker-u1", nozzleDiameter: "0.4", layerHeight: 0.12, autoSelectable: true, tierName: "Fine" },
];

describe("previewProfileMatch against real vendor-shaped fixture files", () => {
  afterEach(() => {
    vi.mocked(listProfiles).mockReset();
  });

  it.each(["creality", "anycubic"])(
    "picks the correct 0.12mm profile for a %s-native file, not the coincidentally-named 0.20mm one",
    async (vendor) => {
      vi.mocked(listProfiles).mockResolvedValue({ profiles: REAL_CATALOG_SHAPE });

      const bytes = new Uint8Array(readFileSync(fixturePath(vendor)));
      const { request } = prepareConvertRequest(bytes);

      // Sanity-check the fixture itself carries what it's supposed to,
      // before asserting on the match -- confirms this is really testing
      // the vendor-relabeled/collision scenario, not something else.
      expect(request.projectSettings.print_settings_id).toContain("Standard");
      expect(request.projectSettings.layer_height).toBe("0.12");

      const result = await previewProfileMatch(request.projectSettings, "http://localhost:8787");
      expect(result.profileId).toBe("snapmaker-u1-0.4-0.12fin");
      expect(result.matchedByTierName).toBe(false);
      expect(result.exact).toBe(true);
    },
  );
});
