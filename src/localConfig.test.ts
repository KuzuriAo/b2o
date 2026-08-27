import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfigPath, readConfig, writeConfig } from "./localConfig.js";

// B2O_CONFIG_DIR overrides the real ~/.b2o -- this is exactly what makes
// this module testable without touching a real home directory.
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "b2o-config-test-"));
  process.env.B2O_CONFIG_DIR = tempDir;
});

afterEach(() => {
  delete process.env.B2O_CONFIG_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("readConfig", () => {
  it("returns an empty object when no config file exists yet", () => {
    expect(readConfig()).toEqual({});
  });

  it("returns an empty object for a corrupted/unparseable config file rather than throwing", () => {
    writeConfig({ apiKey: "b2o_live_placeholder" });
    writeFileSync(getConfigPath(), "{ not valid json"); // corrupt it directly
    expect(readConfig()).toEqual({});
  });

  it("B2O_API_KEY wins over the config file when both are present -- the non-interactive/CI path", () => {
    writeConfig({ apiKey: "b2o_live_from_file" });
    process.env.B2O_API_KEY = "b2o_live_from_env";
    try {
      expect(readConfig()).toEqual({ apiKey: "b2o_live_from_env" });
    } finally {
      delete process.env.B2O_API_KEY;
    }
  });

  it("B2O_API_KEY works even with no config file at all", () => {
    process.env.B2O_API_KEY = "b2o_live_env_only";
    try {
      expect(readConfig()).toEqual({ apiKey: "b2o_live_env_only" });
    } finally {
      delete process.env.B2O_API_KEY;
    }
  });
});

describe("writeConfig / readConfig round trip", () => {
  it("round-trips a saved API key", () => {
    writeConfig({ apiKey: "b2o_live_abc123" });
    expect(readConfig()).toEqual({ apiKey: "b2o_live_abc123" });
  });

  it("creates the config directory if it doesn't exist yet", () => {
    expect(existsSync(tempDir)).toBe(true); // mkdtemp already created it, but...
    rmSync(tempDir, { recursive: true, force: true });
    expect(existsSync(tempDir)).toBe(false);

    writeConfig({ apiKey: "b2o_live_abc123" });
    expect(existsSync(tempDir)).toBe(true);
    expect(readConfig()).toEqual({ apiKey: "b2o_live_abc123" });
  });

  it("writes the config file with mode 0600, both on first creation and on overwrite", () => {
    writeConfig({ apiKey: "b2o_live_first" });
    const firstMode = statSync(getConfigPath()).mode & 0o777;
    expect(firstMode).toBe(0o600);

    writeConfig({ apiKey: "b2o_live_second" });
    const secondMode = statSync(getConfigPath()).mode & 0o777;
    expect(secondMode).toBe(0o600);
  });
});
