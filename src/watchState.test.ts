import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeFingerprint, loadStateFile, saveStateFile } from "./watchState.js";

describe("computeFingerprint", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "b2o-fingerprint-test-"));
    filePath = join(tempDir, "model.3mf");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("changes when the file's size changes", () => {
    writeFileSync(filePath, "a");
    const first = computeFingerprint(filePath);
    writeFileSync(filePath, "aa");
    expect(computeFingerprint(filePath)).not.toBe(first);
  });

  it("changes on a same-size content edit, via mtime", () => {
    writeFileSync(filePath, "Core pieces");
    const first = computeFingerprint(filePath);

    writeFileSync(filePath, "Core Pieces"); // same length, different content
    const future = new Date(Date.now() + 5000);
    utimesSync(filePath, future, future);

    expect(computeFingerprint(filePath)).not.toBe(first);
  });

  it("stays the same for an untouched file", () => {
    writeFileSync(filePath, "unchanged");
    expect(computeFingerprint(filePath)).toBe(computeFingerprint(filePath));
  });
});

describe("loadStateFile / saveStateFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "b2o-state-file-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns an empty record when no state file exists yet", () => {
    expect(loadStateFile(tempDir)).toEqual({});
  });

  it("round-trips a record through save then load", () => {
    saveStateFile(tempDir, { "model.3mf": { fingerprint: "123:456", outcome: "succeeded" } });
    expect(loadStateFile(tempDir)).toEqual({ "model.3mf": { fingerprint: "123:456", outcome: "succeeded" } });
  });

  it("treats a corrupt state file as empty rather than throwing", () => {
    writeFileSync(join(tempDir, ".b2o-state.json"), "{ not valid json");
    expect(loadStateFile(tempDir)).toEqual({});
  });
});
