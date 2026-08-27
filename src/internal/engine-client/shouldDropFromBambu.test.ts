import { describe, expect, it } from "vitest";
import { shouldDropFromBambu } from "./shouldDropFromBambu.js";

describe("shouldDropFromBambu", () => {
  it("drops exact-match Bambu-only files", () => {
    expect(shouldDropFromBambu("Metadata/filament_sequence.json")).toBe(true);
    expect(shouldDropFromBambu("Metadata/cut_information.xml")).toBe(true);
  });

  it("drops per-plate cache files matching the plate_N.json pattern", () => {
    expect(shouldDropFromBambu("Metadata/plate_1.json")).toBe(true);
    expect(shouldDropFromBambu("Metadata/plate_42.json")).toBe(true);
  });

  it("drops stray .py and .3mf files under Metadata/", () => {
    expect(shouldDropFromBambu("Metadata/some_script.py")).toBe(true);
    expect(shouldDropFromBambu("Metadata/nested/leftover.3mf")).toBe(true);
  });

  it("keeps ordinary Bambu/Orca-shared files", () => {
    expect(shouldDropFromBambu("Metadata/project_settings.config")).toBe(false);
    expect(shouldDropFromBambu("3D/3dmodel.model")).toBe(false);
    expect(shouldDropFromBambu("Metadata/plate_1.png")).toBe(false);
  });

  it("does not drop a plate_N.json-like path outside Metadata/", () => {
    expect(shouldDropFromBambu("Other/plate_1.json")).toBe(false);
  });
});
