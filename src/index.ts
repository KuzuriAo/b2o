/**
 * b2o: programmatic surface, for anything that wants to call bambu2orca's
 * API-key-authenticated conversion path without going through the CLI
 * directly. The `b2o` binary (see cli.ts) is built on top of this same
 * module, not a separate implementation.
 */

export { B2oApiError, DEFAULT_BASE_URL, convert, listProfiles, requestApiKey } from "./convertClient.js";
export { getConfigPath, readConfig, writeConfig } from "./localConfig.js";
export type { B2oConfig } from "./localConfig.js";
export { computeOutputPath, runConvert } from "./commands/convert.js";
export type { ConvertOptions } from "./commands/convert.js";
