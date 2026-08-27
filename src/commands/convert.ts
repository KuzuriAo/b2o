import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { applyConvertResponse, prepareConvertRequest, unwrapIfBundle } from "../internal/engine-client/index.js";
import type { ConvertRequest, ConvertResponse } from "../internal/shared/index.js";
import { convert as convertApi } from "../convertClient.js";
import { readConfig } from "../localConfig.js";
import { previewProfileMatch, type ProfileMatchPreview } from "../profileMatchPreview.js";

export interface ConvertOptions {
  profile?: string;
  filamentCompliance?: "generic" | "snapmaker";
  outDir?: string;
  suffix: string;
  dryRun: boolean;
  verbose: boolean;
  skipExisting: boolean;
  baseUrl: string;
}

/**
 * Computes the output path for one converted entry, given the entry's
 * own display name (e.g. "AMS.3mf", the nested name for a bundle entry,
 * or the plain input filename otherwise), the directory to fall back to
 * when `--out-dir` isn't set, the suffix (default "_U1", "" to remove
 * it), and an optional `--out-dir` override.
 */
export function computeOutputPath(entryName: string, defaultDir: string, suffix: string, outDir: string | undefined): string {
  const dir = outDir ? resolve(outDir) : resolve(defaultDir);
  const base = basename(entryName, extname(entryName));
  return join(dir, `${base}${suffix}.3mf`);
}

/**
 * --skip-existing's actual check -- a plain existsSync gate, split out
 * only so the condition itself (not the fs call) is easy to reason about
 * and test. Deliberately opt-in, not the default: a previous b2o output
 * is a fully re-derivable build artifact, not source data, so silently
 * overwriting it on every run is the correct default (matches
 * tsc/esbuild's own "just overwrite dist/" convention) -- this exists
 * for the one real use case that default doesn't serve: resuming an
 * interrupted large batch without redoing already-converted files.
 */
export function shouldSkipExisting(outPath: string, skipExisting: boolean): boolean {
  return skipExisting && existsSync(outPath);
}

function summarizePayload(request: ConvertRequest): string {
  const settingsKeyCount = Object.keys(request.projectSettings).length;
  return [
    `    projectSettings: ${settingsKeyCount} keys (settings only -- no mesh)`,
    `    objects: ${request.objects.length} (each carries only a bounding box or fallback translation, never mesh vertices)`,
    `    total bytes of mesh geometry in this payload: 0`,
    ...(request.filamentComplianceMode ? [`    filamentComplianceMode: ${request.filamentComplianceMode}`] : []),
  ].join("\n");
}

/**
 * Non-null only for the two cases worth actually printing: a genuine
 * "no reasonable match, fell back to the default" warning, or a milder
 * "closest available, not exact" note. A confident match ("auto-exact"/
 * "auto-tier-name") gets no line here -- the caller's own "matched
 * profile: ..." summary is enough for those.
 */
export function matchWarningLine(matchSource: ProfileMatchPreview["matchSource"], profileIdLabel: string): string | null {
  if (matchSource === "default-fallback") {
    return (
      `    WARNING: no confident profile match found for this file (neither layer height nor tier name matched anything) -- ` +
      `falling back to ${profileIdLabel}. Consider passing --profile <id> explicitly (see "b2o profiles").`
    );
  }
  if (matchSource === "auto-nearest") {
    return `    note: ${profileIdLabel} is the closest available layer height, not an exact match.`;
  }
  return null;
}

/** --dry-run's local preview of auto-matching, computed without spending a real (rate-limited) conversion. */
async function logMatchPreview(request: ConvertRequest, baseUrl: string): Promise<void> {
  const preview = await previewProfileMatch(request.projectSettings, baseUrl);
  const label = preview.profileId || "the server's default profile";
  console.log(`    predicted profile match: ${label} (${preview.matchSource})`);
  const line = matchWarningLine(preview.matchSource, label);
  if (line) console.log(line);
}

/** A real run's authoritative match info, straight from the server's own response -- always shown when it's a fallback, only in --verbose otherwise. */
function logActualMatch(response: ConvertResponse, verbose: boolean): void {
  if (!response.profileMatch) return;
  const { profileId, matchSource } = response.profileMatch;
  const line = matchWarningLine(matchSource, profileId);
  if (line) {
    console.log(line);
  } else if (verbose) {
    console.log(`    matched profile: ${profileId} (${matchSource})`);
  }
}

/**
 * `--filament-compliance snapmaker` doesn't have a branded Snapmaker
 * preset for every material -- the server silently falls back to Generic
 * for whichever ones don't (never fails the conversion over it), and
 * reports exactly which materials that happened for. Always worth
 * surfacing, not just in --verbose, since a print made with an
 * unexpectedly-Generic filament is the kind of surprise a "quiet" run
 * shouldn't hide.
 */
function logComplianceFallback(response: ConvertResponse): void {
  if (!response.filamentComplianceFallback || response.filamentComplianceFallback.length === 0) return;
  console.log(
    `    note: no branded Snapmaker preset exists for ${response.filamentComplianceFallback.join(", ")} -- fell back to Generic for ${
      response.filamentComplianceFallback.length === 1 ? "that material" : "those materials"
    }.`,
  );
}

/**
 * Where the exact request JSON gets written when --dry-run/--verbose ask
 * for it -- a real settings file easily has several hundred keys, too
 * many to usefully print inline on every run. Writing it to a file
 * instead of stdout keeps routine output readable while still making the
 * complete, actual payload one `cat`/`jq` away -- the same "checkable,
 * not just asserted" bar the --dry-run/--verbose flags exist for at all.
 */
export function payloadFilePath(entryName: string, defaultDir: string, outDir: string | undefined): string {
  const dir = outDir ? resolve(outDir) : resolve(defaultDir);
  const base = basename(entryName, extname(entryName));
  return join(dir, `${base}.b2o-payload.json`);
}

async function convertOne(
  entryName: string,
  bytes: Uint8Array,
  defaultDir: string,
  originalInputPath: string,
  options: ConvertOptions,
  apiKey: string | undefined,
): Promise<void> {
  const parsed = prepareConvertRequest(bytes);
  const request: ConvertRequest = {
    ...parsed.request,
    ...(options.profile ? { profileId: options.profile } : {}),
    ...(options.filamentCompliance ? { filamentComplianceMode: options.filamentCompliance } : {}),
  };
  const outPath = computeOutputPath(entryName, defaultDir, options.suffix, options.outDir);

  if (resolve(outPath) === resolve(originalInputPath)) {
    throw new Error(
      `Refusing to run: the computed output path for "${entryName}" (${outPath}) is identical to the input file (${originalInputPath}). ` +
        `Use --out-dir to write somewhere else, or a non-empty --suffix.`,
    );
  }

  if (shouldSkipExisting(outPath, options.skipExisting)) {
    console.log(`${options.dryRun ? "[dry-run] " : ""}${entryName}: skipped (already exists at ${outPath})`);
    return;
  }

  if (options.dryRun || options.verbose) {
    const payloadPath = payloadFilePath(entryName, defaultDir, options.outDir);
    writeFileSync(payloadPath, JSON.stringify(request, null, 2));
    console.log(`${options.dryRun ? "[dry-run] " : ""}${entryName}`);
    console.log(summarizePayload(request));
    console.log(`    full request payload written to: ${payloadPath}`);
    // Skipped when --profile forces a specific id -- there's no auto-match to preview.
    if (!options.profile) await logMatchPreview(request, options.baseUrl);
  }

  if (options.dryRun) {
    console.log(`    would write: ${outPath}`);
    return;
  }

  // apiKey's presence is already guaranteed by runConvert before any file
  // is processed (dry-run aside, which never reaches here) -- this is
  // just satisfying the type checker, not a real runtime path.
  if (!apiKey) {
    throw new Error("No API key found. Run: b2o login <email>, then b2o key set.");
  }

  const response = await convertApi(apiKey, request, options.baseUrl);
  logActualMatch(response, options.verbose);
  logComplianceFallback(response);
  const outBytes = applyConvertResponse(parsed, response);
  writeFileSync(outPath, outBytes);
  console.log(`${entryName} -> ${outPath}`);
}

/**
 * Processes every input path SEQUENTIALLY, not in parallel -- matches
 * the same "no concurrency bookkeeping" stance already settled for the
 * (separate, org-tier) "Regenerate All" design: avoids D1 write-
 * contention on the shared rate-limit counter, and keeps failure/resume
 * trivial to reason about (if this is interrupted, whichever line was
 * last printed tells you exactly where to resume).
 */
export async function runConvert(inputPaths: string[], options: ConvertOptions): Promise<void> {
  const { apiKey } = readConfig();
  // Fail fast, before reading/parsing anything, rather than partway
  // through a batch -- --dry-run never touches the network, so it's the
  // one case allowed to proceed without a key at all.
  if (!options.dryRun && !apiKey) {
    throw new Error("No API key found. Run: b2o login <email>, then b2o key set.");
  }

  // A courtesy nudge, not an enforced step -- --profile already makes
  // the auto-match preview moot, and a single file barely benefits, but a
  // live multi-file batch is exactly where previewing every file's match
  // for free (via --dry-run, no network conversion spent) is worth
  // pointing out before spending real quota on all of them.
  if (!options.dryRun && !options.profile && inputPaths.length > 1) {
    console.log("Tip: run this same command with --dry-run first to preview which profile each file will auto-match to, before spending API quota on the live conversions.\n");
  }

  for (const inputPath of inputPaths) {
    const bytes = new Uint8Array(readFileSync(inputPath));
    const defaultDir = dirname(resolve(inputPath));
    const bundleEntries = unwrapIfBundle(bytes);

    if (bundleEntries) {
      for (const entry of bundleEntries) {
        await convertOne(entry.name, entry.bytes, defaultDir, inputPath, options, apiKey);
      }
    } else {
      await convertOne(basename(inputPath), bytes, defaultDir, inputPath, options, apiKey);
    }
  }
}

const WATCH_POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function isConvertibleFile(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return ext === ".3mf" || ext === ".zip";
}

/** Per-file state a watch session tracks across polls -- exported only so tests can drive {@link watchPollOnce} deterministically, without any real timers. */
export interface WatchState {
  lastSize: Map<string, number>;
  done: Set<string>;
}

export function createWatchState(): WatchState {
  return { lastSize: new Map(), done: new Set() };
}

/**
 * Runs exactly one poll pass over `folder`, converting any file whose size
 * has just settled (unchanged from the previous poll) and hasn't already
 * been processed. Split out from {@link runWatch} purely so it can be
 * driven directly, poll by poll, in tests -- the real CLI path only ever
 * calls it from the infinite loop below.
 *
 * A file is only converted once its size is unchanged across two
 * consecutive polls -- guards against reading a file mid-copy/mid-download
 * (a partial zip fails to parse, which without this would either error out
 * permanently or, worse, silently succeed on truncated data).
 */
export async function watchPollOnce(folder: string, options: ConvertOptions, state: WatchState): Promise<void> {
  const entries = readdirSync(folder).filter(isConvertibleFile);
  for (const name of entries) {
    if (state.done.has(name)) continue;

    let size: number;
    try {
      size = statSync(join(folder, name)).size;
    } catch {
      continue; // vanished between readdir and stat -- reconsider next poll
    }

    const previousSize = state.lastSize.get(name);
    state.lastSize.set(name, size);
    if (previousSize !== size) continue; // still being written (or just appeared) -- wait for the next poll to confirm it settled

    state.done.add(name);
    try {
      await runConvert([join(folder, name)], options);
    } catch (err) {
      console.error(`Error converting ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Watches `folder` for new .3mf/.zip files and converts each one as it
 * appears, running until interrupted (Ctrl+C) -- for a folder a slicer,
 * export pipeline, or download manager writes new files into over time,
 * rather than a fixed batch known up front. The caller (cli.ts) requires
 * --out-dir to point somewhere other than `folder` before calling this --
 * without that, a freshly written output would itself get picked up as a
 * "new" input on the next poll, converting its own output forever.
 */
export async function runWatch(folder: string, options: ConvertOptions): Promise<void> {
  const state = createWatchState();
  console.log(`Watching ${folder} for new .3mf/.zip files (Ctrl+C to stop)...`);
  for (;;) {
    await watchPollOnce(folder, options, state);
    await sleep(WATCH_POLL_INTERVAL_MS);
  }
}
