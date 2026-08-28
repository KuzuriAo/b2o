import type { ProfileSummary } from "./internal/shared/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listProfiles } from "./convertClient.js";
import { previewProfileMatch } from "./profileMatchPreview.js";

vi.mock("./convertClient.js", () => ({
  listProfiles: vi.fn(),
}));

function makeProfile(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    id: "snapmaker-u1-0.4-standard",
    displayName: "0.20 Standard @Snapmaker U1 (0.4 nozzle)",
    printerId: "snapmaker-u1",
    nozzleDiameter: "0.4",
    layerHeight: 0.2,
    autoSelectable: true,
    tierName: "Standard",
    ...overrides,
  };
}

describe("previewProfileMatch", () => {
  afterEach(() => {
    vi.mocked(listProfiles).mockReset();
  });

  it("reports default-fallback without ever calling the API when no nozzle diameter can be detected", async () => {
    const result = await previewProfileMatch({}, "http://localhost:8787");
    expect(result.matchSource).toBe("default-fallback");
    expect(result.profileId).toBe("");
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it("reports an exact match when a candidate's layer height matches exactly", async () => {
    vi.mocked(listProfiles).mockResolvedValue({ profiles: [makeProfile({ layerHeight: 0.2 })] });
    const result = await previewProfileMatch({ nozzle_diameter: "0.4", layer_height: "0.2" }, "http://localhost:8787");
    expect(result).toEqual({
      profileId: "snapmaker-u1-0.4-standard",
      nozzleDiameter: "0.4",
      exact: true,
      matchedByTierName: false,
      matchSource: "auto-exact",
    });
  });

  it("reports default-fallback when a diameter is detected but no candidate exists at all", async () => {
    vi.mocked(listProfiles).mockResolvedValue({ profiles: [] });
    const result = await previewProfileMatch({ nozzle_diameter: "0.4", layer_height: "0.2" }, "http://localhost:8787");
    expect(result.matchSource).toBe("default-fallback");
    expect(result.nozzleDiameter).toBe("0.4"); // diameter itself was still detected
  });

  it("prefers a tier-name match over the nearest layer height when they tie", async () => {
    // Mirrors the real catalog: "0.20 Strength" and "0.20 Standard" sit at
    // the identical 0.20mm layer height (see profileCatalog.ts's
    // snapmaker-u1-0.4-0.20str) -- layer height alone can't tell them
    // apart, only the source's own tier name can.
    vi.mocked(listProfiles).mockResolvedValue({
      profiles: [makeProfile({ id: "near-by-height", layerHeight: 0.2, tierName: "Standard" }), makeProfile({ id: "by-name", layerHeight: 0.2, tierName: "Strength" })],
    });
    const result = await previewProfileMatch(
      { nozzle_diameter: "0.4", layer_height: "0.2", print_settings_id: "0.20mm Strength @BBL X1C" },
      "http://localhost:8787",
    );
    expect(result.profileId).toBe("by-name");
    expect(result.matchSource).toBe("auto-tier-name");
  });

  it("rejects a tier-name match when it's a meaningfully worse layer-height fit than the nearest alternative", async () => {
    // Confirmed on a real Creality Print export: its own "Standard" tier
    // was 0.12mm, but Snapmaker's own "Standard" tier is 0.20mm -- the
    // shared word is a cross-vendor coincidence, not the same tier.
    vi.mocked(listProfiles).mockResolvedValue({
      profiles: [makeProfile({ id: "snapmaker-0.12fin", layerHeight: 0.12, tierName: "Fine" }), makeProfile({ id: "snapmaker-0.20standard", layerHeight: 0.2, tierName: "Standard" })],
    });
    const result = await previewProfileMatch(
      { nozzle_diameter: "0.4", layer_height: "0.12", print_settings_id: "0.12mm Standard @Creality K2 Plus 0.4 nozzle" },
      "http://localhost:8787",
    );
    expect(result.profileId).toBe("snapmaker-0.12fin");
    expect(result.matchedByTierName).toBe(false);
  });
});
