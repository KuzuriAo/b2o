import { describe, expect, it } from "vitest";
import { detectNozzleDiameter } from "./detectNozzleDiameter.js";

describe("detectNozzleDiameter", () => {
  it("reads the first entry of a Bambu-style per-extruder array", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"] })).toBe("0.4");
  });

  it("accepts a bare scalar", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: "0.6" })).toBe("0.6");
    expect(detectNozzleDiameter({ nozzle_diameter: 0.6 })).toBe("0.6");
  });

  it("snaps an exact match for each supported size", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.2"] })).toBe("0.2");
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.8"] })).toBe("0.8");
  });

  it("fuzzy-matches an unsupported diameter to the nearest supported one", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.3"] })).toBe("0.2");
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.5"] })).toBe("0.4");
    expect(detectNozzleDiameter({ nozzle_diameter: ["1.0"] })).toBe("0.8");
  });

  it("returns null when nozzle_diameter is missing or unparseable", () => {
    expect(detectNozzleDiameter({})).toBeNull();
    expect(detectNozzleDiameter({ nozzle_diameter: "not-a-number" })).toBeNull();
    expect(detectNozzleDiameter({ nozzle_diameter: [] })).toBeNull();
  });
});
