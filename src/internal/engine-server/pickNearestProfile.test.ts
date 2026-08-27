import { describe, expect, it } from "vitest";
import { pickNearestProfile } from "./pickNearestProfile.js";

describe("pickNearestProfile", () => {
  const candidates = [
    { id: "fine", layerHeight: 0.12 },
    { id: "standard", layerHeight: 0.2 },
    { id: "draft", layerHeight: 0.24 },
  ];

  it("returns an exact match when one candidate's layerHeight matches exactly", () => {
    expect(pickNearestProfile(candidates, 0.2)).toEqual({ profileId: "standard", exact: true });
  });

  it("returns the nearest candidate with exact:false when nothing matches exactly", () => {
    expect(pickNearestProfile(candidates, 0.18)).toEqual({ profileId: "standard", exact: false });
    expect(pickNearestProfile(candidates, 0.13)).toEqual({ profileId: "fine", exact: false });
  });

  it("picks the finer of two equidistant candidates", () => {
    const equidistant = [
      { id: "a", layerHeight: 0.1 },
      { id: "b", layerHeight: 0.2 },
    ];
    expect(pickNearestProfile(equidistant, 0.15)).toEqual({ profileId: "a", exact: false });
  });

  it("returns null for an empty candidate list", () => {
    expect(pickNearestProfile([], 0.2)).toBeNull();
  });

  it("returns null when the target layer height is null", () => {
    expect(pickNearestProfile(candidates, null)).toBeNull();
  });
});
