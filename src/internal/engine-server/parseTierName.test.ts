import { describe, expect, it } from "vitest";
import { normalizeTierName, parseTierName } from "./parseTierName.js";

describe("parseTierName", () => {
  it("extracts the tier name from a Bambu-style print_settings_id", () => {
    expect(parseTierName("0.08mm Extra Fine @BBL X1C")).toBe("Extra Fine");
    expect(parseTierName("0.20mm Standard @BBL P1S")).toBe("Standard");
  });

  it("extracts the tier name from our own Snapmaker-style displayName", () => {
    expect(parseTierName("0.12 Fine @Snapmaker U1 (0.4 nozzle)")).toBe("Fine");
    expect(parseTierName("0.08 High Quality @Snapmaker U1 (0.4 nozzle)")).toBe("High Quality");
  });

  it("returns null when there's no @ separator", () => {
    expect(parseTierName("0.08mm Extra Fine")).toBeNull();
  });

  it("returns null for an empty/unparseable string", () => {
    expect(parseTierName("")).toBeNull();
    expect(parseTierName("Custom Profile")).toBeNull();
  });
});

describe("normalizeTierName", () => {
  it("is case-insensitive and collapses whitespace", () => {
    expect(normalizeTierName("Extra Fine")).toBe(normalizeTierName("extra   fine"));
    expect(normalizeTierName(" High Quality ")).toBe("high quality");
  });
});
