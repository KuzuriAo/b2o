import { listProfiles } from "../convertClient.js";
import { formatTable } from "../table.js";

/** `b2o profiles [--nozzle <mm>]` -- the CLI equivalent of the web UI's profile-picker dropdown, so `--profile <id>` on `b2o convert` has somewhere to get a valid id from. */
export async function runProfiles(diameter: string | undefined, baseUrl: string): Promise<void> {
  const { profiles } = await listProfiles(diameter, baseUrl);

  if (profiles.length === 0) {
    console.log(diameter ? `No profiles found for nozzle diameter ${diameter}.` : "No profiles found.");
    return;
  }

  // Plain byte-wise comparison (not localeCompare, which is locale-aware
  // and can reorder case/diacritics differently) -- matches what piping
  // this output through the `sort` command would do, since `id` is
  // always the first, and always unique, column: sorting by id alone is
  // equivalent to sorting the fully-rendered, padded lines.
  const sorted = [...profiles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rows = sorted.map((p) => [
    p.id,
    p.displayName,
    `${p.nozzleDiameter}mm`,
    p.tierName + (p.autoSelectable ? "" : " (manual-select only)"),
  ]);
  console.log(formatTable(rows));
}
