import { describe, expect, it } from "vitest";
import { pickProfile, type TierAwareProfileCandidate } from "./pickProfile.js";

describe("pickProfile", () => {
  // Mirrors the real 0.4mm tie at 0.08mm: Extra Fine is not autoSelectable,
  // High Quality is.
  const tiedAt008: TierAwareProfileCandidate[] = [
    { id: "extra-fine", layerHeight: 0.08, tierName: "Extra Fine", autoSelectable: false },
    { id: "high-quality", layerHeight: 0.08, tierName: "High Quality", autoSelectable: true },
  ];

  it("prefers the source's own tier name over the autoSelectable default", () => {
    expect(pickProfile(tiedAt008, { layerHeight: 0.08, tierName: "Extra Fine" })).toEqual({
      profileId: "extra-fine",
      exact: true,
      matchedByTierName: true,
    });
  });

  it("falls back to the autoSelectable candidate when the tier name doesn't match anything", () => {
    expect(pickProfile(tiedAt008, { layerHeight: 0.08, tierName: "Some Bambu-only tier" })).toEqual({
      profileId: "high-quality",
      exact: true,
      matchedByTierName: false,
    });
  });

  it("falls back to nearest-by-layer-height among autoSelectable when no tier name is given", () => {
    expect(pickProfile(tiedAt008, { layerHeight: 0.08, tierName: null })).toEqual({
      profileId: "high-quality",
      exact: true,
      matchedByTierName: false,
    });
  });

  it("uses layer height to disambiguate multiple candidates sharing the same tier name", () => {
    const multipleStandards: TierAwareProfileCandidate[] = [
      { id: "std-006", layerHeight: 0.06, tierName: "Standard", autoSelectable: true },
      { id: "std-010", layerHeight: 0.1, tierName: "Standard", autoSelectable: true },
      { id: "std-014", layerHeight: 0.14, tierName: "Standard", autoSelectable: true },
    ];
    expect(pickProfile(multipleStandards, { layerHeight: 0.095, tierName: "Standard" })).toEqual({
      profileId: "std-010",
      exact: false,
      matchedByTierName: true,
    });
  });

  it("returns null when there are no candidates at all", () => {
    expect(pickProfile([], { layerHeight: 0.08, tierName: "Extra Fine" })).toBeNull();
  });

  // Confirmed on a real Creality Print export: its own "0.12mm Standard"
  // tier collides by name with Snapmaker's own "Standard" tier, which is
  // actually 0.20mm -- a cross-vendor coincidence, not the same tier.
  it("rejects a tier-name match when a name-agnostic candidate is a much closer layer-height fit (cross-vendor naming collision)", () => {
    const crossVendorCollision: TierAwareProfileCandidate[] = [
      { id: "snapmaker-0.12fin", layerHeight: 0.12, tierName: "Fine", autoSelectable: true },
      { id: "snapmaker-0.20standard", layerHeight: 0.2, tierName: "Standard", autoSelectable: true },
    ];
    expect(pickProfile(crossVendorCollision, { layerHeight: 0.12, tierName: "Standard" })).toEqual({
      profileId: "snapmaker-0.12fin",
      exact: true,
      matchedByTierName: false,
    });
  });

  it("still trusts a tier-name match that's an equally close (or closer) layer-height fit than any alternative", () => {
    const genuineMatch: TierAwareProfileCandidate[] = [
      { id: "snapmaker-0.12fin", layerHeight: 0.12, tierName: "Fine", autoSelectable: true },
      { id: "snapmaker-0.20standard", layerHeight: 0.2, tierName: "Standard", autoSelectable: true },
    ];
    expect(pickProfile(genuineMatch, { layerHeight: 0.12, tierName: "Fine" })).toEqual({
      profileId: "snapmaker-0.12fin",
      exact: true,
      matchedByTierName: true,
    });
  });
});
