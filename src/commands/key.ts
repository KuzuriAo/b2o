import { getConfigPath, readConfig, writeConfig } from "../localConfig.js";
import { promptHidden } from "../promptHidden.js";

const KEY_PREFIX = "b2o_live_";

/**
 * No key argument accepted here by design -- see promptHidden's doc
 * comment. The key is read via hidden-input prompt only.
 */
export async function runKeySet(): Promise<void> {
  const rawKey = await promptHidden("Paste your API key (input hidden): ");

  if (!rawKey) {
    throw new Error("No key entered -- nothing saved.");
  }
  if (!rawKey.startsWith(KEY_PREFIX)) {
    throw new Error(`That doesn't look like a b2o API key (expected a "${KEY_PREFIX}" prefix) -- nothing saved.`);
  }

  writeConfig({ ...readConfig(), apiKey: rawKey });
  console.log(`Saved to ${getConfigPath()} (mode 0600).`);
}

function maskKey(key: string): string {
  return key.length > 13 ? `${key.slice(0, 9)}...${key.slice(-4)}` : "****";
}

export function runKeyShow(reveal: boolean): void {
  const { apiKey } = readConfig();
  if (!apiKey) {
    console.log("No API key saved. Run: b2o login <email>");
    return;
  }
  if (reveal) {
    console.log(apiKey);
  } else {
    console.log(maskKey(apiKey));
    console.log("(use --reveal to show the full key)");
  }
}
