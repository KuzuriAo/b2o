import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeOutputPath, matchWarningLine, payloadFilePath, shouldSkipExisting } from "./convert.js";

describe("computeOutputPath", () => {
  it("appends the default _U1 suffix, alongside the input by default", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "_U1", undefined)).toBe("/models/AMS_U1.3mf");
  });

  it("supports a custom suffix", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "_Snapmaker", undefined)).toBe("/models/AMS_Snapmaker.3mf");
  });

  it("supports an empty suffix, producing the bare name", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "", undefined)).toBe("/models/AMS.3mf");
  });

  it("writes into --out-dir instead of the input's own directory when given", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "_U1", "/converted")).toBe("/converted/AMS_U1.3mf");
  });

  it("strips any input extension, not just .3mf, before appending the suffix", () => {
    expect(computeOutputPath("bundle.zip", "/models", "_U1", undefined)).toBe("/models/bundle_U1.3mf");
  });
});

describe("payloadFilePath", () => {
  it("names the sidecar payload file distinctly from the converted .3mf output", () => {
    expect(payloadFilePath("AMS.3mf", "/models", undefined)).toBe("/models/AMS.b2o-payload.json");
  });

  it("respects --out-dir the same way computeOutputPath does", () => {
    expect(payloadFilePath("AMS.3mf", "/models", "/converted")).toBe("/converted/AMS.b2o-payload.json");
  });

  it("never collides with computeOutputPath's own output for the same inputs", () => {
    const outPath = computeOutputPath("AMS.3mf", "/models", "_U1", undefined);
    const payloadPath = payloadFilePath("AMS.3mf", "/models", undefined);
    expect(outPath).not.toBe(payloadPath);
  });
});

describe("matchWarningLine", () => {
  it("warns clearly on default-fallback, naming the fallback profile", () => {
    const line = matchWarningLine("default-fallback", "snapmaker-u1-0.4-standard");
    expect(line).toContain("WARNING");
    expect(line).toContain("snapmaker-u1-0.4-standard");
  });

  it("notes, more mildly, when it's the nearest available height rather than exact", () => {
    const line = matchWarningLine("auto-nearest", "snapmaker-u1-0.6-standard");
    expect(line).not.toContain("WARNING");
    expect(line).toContain("snapmaker-u1-0.6-standard");
  });

  it("stays silent for a confident exact or tier-name match", () => {
    expect(matchWarningLine("auto-exact", "snapmaker-u1-0.4-0.12fin")).toBeNull();
    expect(matchWarningLine("auto-tier-name", "snapmaker-u1-0.4-0.12fin")).toBeNull();
  });
});

describe("shouldSkipExisting", () => {
  let tempDir: string;
  let existingPath: string;
  let missingPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "b2o-skip-existing-test-"));
    existingPath = join(tempDir, "AMS_U1.3mf");
    missingPath = join(tempDir, "not-there_U1.3mf");
    writeFileSync(existingPath, "placeholder");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("is false when --skip-existing wasn't passed, even if the output already exists", () => {
    expect(shouldSkipExisting(existingPath, false)).toBe(false);
  });

  it("is true when --skip-existing was passed and the output already exists", () => {
    expect(shouldSkipExisting(existingPath, true)).toBe(true);
  });

  it("is false when --skip-existing was passed but there's nothing to skip yet", () => {
    expect(shouldSkipExisting(missingPath, true)).toBe(false);
  });
});
