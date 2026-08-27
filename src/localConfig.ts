import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface B2oConfig {
  apiKey?: string;
}

/** Overridable via B2O_CONFIG_DIR (also what makes this module testable without touching a real home directory). */
function configDir(): string {
  return process.env.B2O_CONFIG_DIR || join(homedir(), ".b2o");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

export function getConfigPath(): string {
  return configPath();
}

/**
 * B2O_API_KEY, if set, always wins over the config file -- this is the
 * non-interactive path for CI/build-pipeline use (a vendor's publish
 * workflow, an agent-driven integration), where there's no terminal to
 * run `b2o key set`'s interactive hidden-input prompt against at all.
 * The config file remains the interactive/human path for local use --
 * neither is a fallback for the other so much as two independent ways to
 * supply the same thing, env var taking priority when both are present.
 */
export function readConfig(): B2oConfig {
  const envKey = process.env.B2O_API_KEY;
  if (envKey) return { apiKey: envKey };

  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as B2oConfig;
  } catch {
    return {};
  }
}

/**
 * Writes the config file with mode 0600 (owner read/write only) -- it can
 * hold a live API key, a credential as sensitive as a password. The
 * `mode` option on writeFileSync only applies when the file is newly
 * created, not when an existing file is overwritten, so chmodSync is
 * called explicitly every time regardless of whether the file already
 * existed.
 */
export function writeConfig(config: B2oConfig): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = configPath();
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}
