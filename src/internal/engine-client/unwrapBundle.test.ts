import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { unwrapIfBundle } from "./unwrapBundle.js";

const fixturePath = fileURLToPath(new URL("../../fixtures/synthetic-2plate.3mf", import.meta.url));
const fixtureBytes = new Uint8Array(readFileSync(fixturePath));

describe("unwrapIfBundle", () => {
  it("returns null for a plain 3MF (has its own project_settings.config)", () => {
    expect(unwrapIfBundle(fixtureBytes)).toBeNull();
  });

  it("returns null for bytes that aren't a zip at all", () => {
    expect(unwrapIfBundle(new TextEncoder().encode("not a zip"))).toBeNull();
  });

  it("returns null for a zip with no .3mf entries and no project_settings.config", () => {
    const notABundle = zipSync({ "readme.txt": new TextEncoder().encode("hello") });
    expect(unwrapIfBundle(notABundle)).toBeNull();
  });

  it("unwraps a zip bundling several .3mf files into their own entries", () => {
    const bundle = zipSync({
      "AMS.3mf": fixtureBytes,
      "SPLIT.3mf": fixtureBytes,
    });
    const result = unwrapIfBundle(bundle);
    expect(result).not.toBeNull();
    expect(result!.map((e) => e.name).sort()).toEqual(["AMS.3mf", "SPLIT.3mf"]);
    // each extracted entry's bytes are a real, independently-parseable 3MF
    for (const entry of result!) {
      expect(unzipSync(entry.bytes)).toHaveProperty("Metadata/project_settings.config");
    }
  });

  it("strips directory prefixes from nested entry names", () => {
    const bundle = zipSync({ "variants/AMS.3mf": fixtureBytes });
    const result = unwrapIfBundle(bundle);
    expect(result).toEqual([{ name: "AMS.3mf", bytes: fixtureBytes }]);
  });

  it("ignores non-.3mf sibling entries alongside real ones (e.g. a readme)", () => {
    const bundle = zipSync({
      "AMS.3mf": fixtureBytes,
      "README.txt": new TextEncoder().encode("read me"),
    });
    const result = unwrapIfBundle(bundle);
    expect(result!.map((e) => e.name)).toEqual(["AMS.3mf"]);
  });

  it("handles a bundle of exactly one .3mf the same way as several", () => {
    const bundle = zipSync({ "MC.3mf": fixtureBytes });
    const result = unwrapIfBundle(bundle);
    expect(result!.map((e) => e.name)).toEqual(["MC.3mf"]);
  });
});
