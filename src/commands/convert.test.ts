import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConvertOptions } from "./convert.js";
import { computeOutputPath, createWatchState, matchWarningLine, payloadFilePath, shouldSkipExisting, watchPollOnce } from "./convert.js";

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

describe("watchPollOnce", () => {
  let tempDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const options: ConvertOptions = { suffix: "_U1", dryRun: true, verbose: false, skipExisting: false, baseUrl: "http://example.invalid" };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "b2o-watch-test-"));
    // Every file below is plain text, not a real .3mf -- runConvert will fail to parse it and
    // log via console.error. That's fine here: these tests only care whether an attempt was
    // made (and exactly once), not whether the conversion itself succeeded.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    consoleErrorSpy.mockRestore();
  });

  it("ignores files that aren't .3mf or .zip", async () => {
    writeFileSync(join(tempDir, "readme.txt"), "hello");
    const state = createWatchState();
    await watchPollOnce(tempDir, options, state);
    await watchPollOnce(tempDir, options, state);
    expect(state.done.size).toBe(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("waits for a file's size to settle across two polls before attempting it", async () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "partial");
    const state = createWatchState();

    await watchPollOnce(tempDir, options, state); // first sighting -- not stable yet
    expect(state.done.has("model.3mf")).toBe(false);

    await watchPollOnce(tempDir, options, state); // unchanged since the last poll -- now stable
    expect(state.done.has("model.3mf")).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("resets the stability count if the file grows between polls (still being written)", async () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "a");
    const state = createWatchState();

    await watchPollOnce(tempDir, options, state); // sees size 1
    writeFileSync(filePath, "aa"); // grew -- still being written
    await watchPollOnce(tempDir, options, state); // size changed (1 -> 2) -- still not stable
    expect(state.done.has("model.3mf")).toBe(false);

    await watchPollOnce(tempDir, options, state); // unchanged (2 -> 2) -- now stable
    expect(state.done.has("model.3mf")).toBe(true);
  });

  it("never re-attempts a file it already processed, even if its size changes later", async () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "aaaa");
    const state = createWatchState();
    await watchPollOnce(tempDir, options, state);
    await watchPollOnce(tempDir, options, state); // now done, one attempt logged
    expect(state.done.has("model.3mf")).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    writeFileSync(filePath, "bbbbbbbb"); // size changed -- shouldn't matter, already done
    await watchPollOnce(tempDir, options, state);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // still just the one attempt
  });
});
