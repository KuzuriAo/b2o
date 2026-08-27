import { describe, expect, it } from "vitest";
import { lookupFilamentColorName, parseFilamentType } from "./lookupFilamentColorName.js";

describe("parseFilamentType", () => {
  it("strips the 'Bambu ' prefix and everything from ' @' onward", () => {
    expect(parseFilamentType("Bambu PLA Matte @BBL P1S 0.4 nozzle")).toBe("PLA Matte");
    expect(parseFilamentType("Bambu PLA Silk @BBL H2S")).toBe("PLA Silk");
  });

  it("leaves a non-Bambu-prefixed id alone besides trimming the @ scope", () => {
    expect(parseFilamentType("Polymaker™ PLA Pro @BBL X1C")).toBe("Polymaker™ PLA Pro");
  });

  it("returns the whole string trimmed when there's no @ scope at all", () => {
    expect(parseFilamentType("Bambu PLA Basic")).toBe("PLA Basic");
  });

  it("returns null for an empty string", () => {
    expect(parseFilamentType("")).toBeNull();
  });
});

describe("lookupFilamentColorName", () => {
  // Real values from an actual downloaded Bambu Studio project
  // (Bambu/0139 - Omastar - AMS - V1.3mf) -- the exact "PLA Matte
  // #000000 -> Charcoal" case this feature was built for.
  it("matches a real Bambu PLA Matte black to 'Matte Charcoal', not 'Basic Black'", () => {
    expect(lookupFilamentColorName("Bambu PLA Matte @BBL P1S 0.4 nozzle", "#000000")).toEqual({
      vendor: "bambu",
      name: "Matte Charcoal",
    });
  });

  it("matches Bambu PLA Basic black to 'Basic Black', the same hex as PLA Matte's Charcoal", () => {
    expect(lookupFilamentColorName("Bambu PLA Basic @BBL X1C", "#000000")).toEqual({
      vendor: "bambu",
      name: "Basic Black",
    });
  });

  it("matches more real colors from the same downloaded file", () => {
    expect(lookupFilamentColorName("Bambu PLA Matte @BBL P1S 0.4 nozzle", "#FFFFFF")).toEqual({
      vendor: "bambu",
      name: "Matte Ivory White",
    });
    expect(lookupFilamentColorName("Bambu PLA Matte @BBL P1S 0.4 nozzle", "#56B7E6")).toEqual({
      vendor: "bambu",
      name: "Matte Sky Blue",
    });
  });

  it("is case-insensitive on the hex code", () => {
    expect(lookupFilamentColorName("Bambu PLA Matte @BBL P1S", "#ffffff")).toEqual({
      vendor: "bambu",
      name: "Matte Ivory White",
    });
  });

  it("returns null rather than guessing when the hex isn't a known color for that product line", () => {
    // A real case from Umbrella+Corp+Pokeball+V2.3mf: this exact
    // combination isn't in the snapshot (custom-tuned or a color Bambu
    // doesn't sell for this line) -- must not silently pick a near hex.
    expect(lookupFilamentColorName("Bambu PLA Metal @BBL H2S", "#FF0000")).toBeNull();
  });

  it("returns null for a product line not in the snapshot at all", () => {
    expect(lookupFilamentColorName("Bambu PLA Silk @BBL H2S", "#EAECEB")).toBeNull();
  });

  it("returns null for an empty filament_settings_id", () => {
    expect(lookupFilamentColorName("", "#000000")).toBeNull();
  });

  it("matches a Polymaker color by product line and hex", () => {
    expect(lookupFilamentColorName("Panchroma™ Matte PLA", "#2F2E30")).toEqual({
      vendor: "polymaker",
      name: "Matte Charcoal Black",
    });
  });
});
