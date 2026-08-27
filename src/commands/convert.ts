import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { applyConvertResponse, prepareConvertRequest, unwrapIfBundle } from "../internal/engine-client/index.js";
import type { ConvertRequest, ConvertResponse } from "../internal/shared/index.js";
import { archiveOriginal } from "../archiveMove.js";
import { B2oApiError, convert as convertApi } from "../convertClient.js";
import type { Logger } from "../logger.js";
import { readConfig } from "../localConfig.js";
import { previewProfileMatch, type ProfileMatchPreview } from "../profileMatchPreview.js";
import { computeFingerprint, loadStateFile, saveStateFile, type StateFile } from "../watchState.js";

export interface ConvertOptions {
  profile?: string;
  filamentCompliance?: "generic" | "snapmaker";
  outDir?: string;
  archiveDir?: string;
  suffix: string;
  dryRun: boolean;
  verbose: boolean;
  skipExisting: boolean;
  /** True when invoked under `b2o convert --watch`. Contributes to whether state-tracking is active (see {@link runConvert}) -- --watch has no other effect on this file's logic, it's purely a polling loop around runConvert (see {@link runWatch}). */
  watch: boolean;
  baseUrl: string;
  logger: Logger;
}

/**
 * Computes the output path for one converted entry, given the entry's
 * own display name (e.g. "AMS.3mf", the nested name for a bundle entry,
 * or the plain input filename otherwise), the directory to fall back to
 * when `--out-dir` isn't set, the suffix (default "_U1", "" to remove
 * it), and an optional `--out-dir` override.
 */
export function computeOutputPath(entryName: string, defaultDir: string, suffix: string, outDir: string | undefined): string {
  const dir = resolveWorkDir(defaultDir, outDir);
  const base = basename(entryName, extname(entryName));
  return join(dir, `${base}${suffix}.3mf`);
}

/** Where outputs, payload sidecars, and the state file all resolve to -- `--out-dir` if set, otherwise alongside the input. */
function resolveWorkDir(defaultDir: string, outDir: string | undefined): string {
  return outDir ? resolve(outDir) : resolve(defaultDir);
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
async function logMatchPreview(request: ConvertRequest, baseUrl: string, logger: Logger): Promise<void> {
  const preview = await previewProfileMatch(request.projectSettings, baseUrl);
  const label = preview.profileId || "the server's default profile";
  logger.log(`    predicted profile match: ${label} (${preview.matchSource})`);
  const line = matchWarningLine(preview.matchSource, label);
  if (line) logger.log(line);
}

/** A real run's authoritative match info, straight from the server's own response -- always shown when it's a fallback, only in --verbose otherwise. */
function logActualMatch(response: ConvertResponse, verbose: boolean, logger: Logger): void {
  if (!response.profileMatch) return;
  const { profileId, matchSource } = response.profileMatch;
  const line = matchWarningLine(matchSource, profileId);
  if (line) {
    logger.log(line);
  } else if (verbose) {
    logger.log(`    matched profile: ${profileId} (${matchSource})`);
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
function logComplianceFallback(response: ConvertResponse, logger: Logger): void {
  if (!response.filamentComplianceFallback || response.filamentComplianceFallback.length === 0) return;
  logger.log(
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
  const dir = resolveWorkDir(defaultDir, outDir);
  const base = basename(entryName, extname(entryName));
  return join(dir, `${base}.b2o-payload.json`);
}

/**
 * Marks an error as having come from the network call specifically (as
 * opposed to local parsing, path validation, or a filesystem write) --
 * {@link isPermanentFailure} uses this to tell "this exact file will never
 * convert" (a corrupt zip, a malformed request) apart from "this might
 * work if tried again later" (the server was down, rate-limited, or
 * unreachable). Everything that ISN'T tagged this way is treated as
 * permanent by default, since it's deterministic given the same file and
 * flags -- retrying won't change the outcome.
 */
class NetworkStageError extends Error {
  constructor(public original: unknown) {
    super(original instanceof Error ? original.message : String(original));
    if (original instanceof Error && original.stack) this.stack = original.stack;
  }
}

/**
 * Whether retrying this exact file would plausibly produce a different
 * result. A raw fetch failure (network down, DNS, timeout -- no response
 * at all) or a 5xx/429 from the API is transient, worth retrying later.
 * Any other error -- a parse failure, a validation error, or a 4xx from
 * the API other than 429 -- means repeating the identical attempt won't
 * help until something about the file or the request actually changes.
 */
export function isPermanentFailure(err: unknown): boolean {
  const apiError = err instanceof NetworkStageError ? err.original : err;
  if (apiError instanceof B2oApiError) return !(apiError.status >= 500 || apiError.status === 429);
  if (err instanceof NetworkStageError) return false; // raw network failure (no response at all) -- transient
  return true; // local error (parse, validation, etc.) -- deterministic given this exact file, not worth retrying
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
  const { logger } = options;

  if (resolve(outPath) === resolve(originalInputPath)) {
    throw new Error(
      `Refusing to run: the computed output path for "${entryName}" (${outPath}) is identical to the input file (${originalInputPath}). ` +
        `Use --out-dir to write somewhere else, or a non-empty --suffix.`,
    );
  }

  if (shouldSkipExisting(outPath, options.skipExisting)) {
    logger.log(`${options.dryRun ? "[dry-run] " : ""}${entryName}: skipped (already exists at ${outPath})`);
    return;
  }

  if (options.dryRun || options.verbose) {
    const payloadPath = payloadFilePath(entryName, defaultDir, options.outDir);
    writeFileSync(payloadPath, JSON.stringify(request, null, 2));
    logger.log(`${options.dryRun ? "[dry-run] " : ""}${entryName}`);
    logger.log(summarizePayload(request));
    logger.log(`    full request payload written to: ${payloadPath}`);
    // Skipped when --profile forces a specific id -- there's no auto-match to preview.
    if (!options.profile) await logMatchPreview(request, options.baseUrl, logger);
  }

  if (options.dryRun) {
    logger.log(`    would write: ${outPath}`);
    return;
  }

  // apiKey's presence is already guaranteed by runConvert before any file
  // is processed (dry-run aside, which never reaches here) -- this is
  // just satisfying the type checker, not a real runtime path.
  if (!apiKey) {
    throw new Error("No API key found. Run: b2o login <email>, then b2o key set.");
  }

  let response: ConvertResponse;
  try {
    response = await convertApi(apiKey, request, options.baseUrl);
  } catch (err) {
    throw new NetworkStageError(err);
  }
  logActualMatch(response, options.verbose, logger);
  logComplianceFallback(response, logger);
  const outBytes = applyConvertResponse(parsed, response);
  writeFileSync(outPath, outBytes);
  logger.log(`${entryName} -> ${outPath}`);
}

/** Whether the persisted state file (fingerprint -> succeeded/permanently-failed) is consulted at all. Off for a plain one-off `convert` call (which always reconverts, matching the existing documented default) -- on whenever the caller signals this is a repeated/resumable run (--watch, --archive-dir, or --skip-existing), and always off for --dry-run, which never has side effects to track. */
function isStateTrackingActive(options: ConvertOptions): boolean {
  return !options.dryRun && (options.watch || Boolean(options.archiveDir) || options.skipExisting);
}

/**
 * Processes every input path SEQUENTIALLY, not in parallel -- matches
 * the same "no concurrency bookkeeping" stance already settled for the
 * (separate, org-tier) "Regenerate All" design: avoids D1 write-
 * contention on the shared rate-limit counter, and keeps failure/resume
 * trivial to reason about (if this is interrupted, whichever line was
 * last printed tells you exactly where to resume).
 *
 * One bad file (or one bad entry inside a bundle) no longer aborts the
 * rest of the batch -- each is caught individually so a folder of mostly
 * good files still gets processed even if one is broken. When
 * {@link isStateTrackingActive} applies, this also persists a
 * succeeded/permanently-failed record per input (see watchState.ts) and,
 * when --archive-dir is set, moves a fully-succeeded input there. This is
 * the same code path for a one-shot cron-triggered call and for each file
 * {@link runWatch} discovers -- --watch itself contributes nothing beyond
 * the polling loop.
 */
export async function runConvert(inputPaths: string[], options: ConvertOptions): Promise<void> {
  const { apiKey } = readConfig();
  const { logger } = options;
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
    logger.log(
      "Tip: run this same command with --dry-run first to preview which profile each file will auto-match to, before spending API quota on the live conversions.\n",
    );
  }

  const tracking = isStateTrackingActive(options);

  for (const inputPath of inputPaths) {
    const name = basename(inputPath);
    const defaultDir = dirname(resolve(inputPath));
    const workDir = resolveWorkDir(defaultDir, options.outDir);

    if (tracking) {
      let fingerprint: string;
      try {
        fingerprint = computeFingerprint(inputPath);
      } catch (err) {
        logger.error(`Could not read ${name}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      const state = loadStateFile(workDir);
      const record = state[name];
      if (record && record.fingerprint === fingerprint) {
        if (record.outcome === "succeeded") {
          logger.log(`${name}: already converted (unchanged since last run) -- skipping`);
          continue;
        }
        logger.log(`${name}: skipping -- previously failed with a non-retryable error (unchanged since last attempt). Fix or replace the file to retry.`);
        continue;
      }
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(inputPath));
    } catch (err) {
      logger.error(`Error reading ${name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const bundleEntries = unwrapIfBundle(bytes);
    const entries = bundleEntries ?? [{ name, bytes }];

    let anyFailed = false;
    let allFailuresPermanent = true;
    for (const entry of entries) {
      try {
        await convertOne(entry.name, entry.bytes, defaultDir, inputPath, options, apiKey);
      } catch (err) {
        anyFailed = true;
        if (!isPermanentFailure(err)) allFailuresPermanent = false;
        logger.error(`Error converting ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (tracking) {
      recordOutcome(workDir, name, inputPath, anyFailed, allFailuresPermanent);
    }

    if (!anyFailed && options.archiveDir && !options.dryRun) {
      try {
        const dest = archiveOriginal(inputPath, options.archiveDir);
        logger.log(`${name}: archived to ${dest}`);
      } catch (err) {
        logger.error(`Could not archive ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

/**
 * Only ever records "succeeded" (every entry converted) or
 * "permanently-failed" (every failing entry was non-retryable) -- if at
 * least one entry failed transiently, nothing is persisted at all, so the
 * whole input is fully eligible for retry next time (already-succeeded
 * sibling entries just get skipped again cheaply via --skip-existing's own
 * output-existence check, not redone).
 */
function recordOutcome(workDir: string, name: string, inputPath: string, anyFailed: boolean, allFailuresPermanent: boolean): void {
  if (anyFailed && !allFailuresPermanent) return;
  const fingerprint = computeFingerprint(inputPath);
  const state: StateFile = loadStateFile(workDir);
  state[name] = { fingerprint, outcome: anyFailed ? "permanently-failed" : "succeeded" };
  saveStateFile(workDir, state);
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
  /** The fingerprint last seen for a given filename -- used only to detect "unchanged since the previous poll" (the stability check), not to decide whether conversion is needed at all (that's runConvert's persisted state file's job). */
  lastFingerprint: Map<string, string>;
  /** "name:fingerprint" combos already handed to runConvert this session -- suppresses repeatedly re-attempting (and re-logging) the exact same version of a file on every poll. A changed fingerprint is a new entry, so an edited file is naturally let back through. */
  reported: Set<string>;
}

export function createWatchState(): WatchState {
  return { lastFingerprint: new Map(), reported: new Set() };
}

/**
 * Runs exactly one poll pass over `folder`, converting any file whose
 * fingerprint has just settled (unchanged from the previous poll) and
 * hasn't already been handed to runConvert this session. Split out from
 * {@link runWatch} purely so it can be driven directly, poll by poll, in
 * tests -- the real CLI path only ever calls it from the infinite loop
 * below.
 *
 * A file is only converted once its fingerprint is unchanged across two
 * consecutive polls -- guards against reading a file mid-copy/mid-download
 * (a partial zip fails to parse, which without this would either error out
 * permanently or, worse, silently succeed on truncated data).
 */
export async function watchPollOnce(folder: string, options: ConvertOptions, state: WatchState): Promise<void> {
  const entries = readdirSync(folder).filter(isConvertibleFile);
  for (const name of entries) {
    const fullPath = join(folder, name);

    let fingerprint: string;
    try {
      fingerprint = computeFingerprint(fullPath);
    } catch {
      continue; // vanished between readdir and stat -- reconsider next poll
    }

    const key = `${name}:${fingerprint}`;
    if (state.reported.has(key)) continue; // this exact version of this file was already handed to runConvert this session

    const previousFingerprint = state.lastFingerprint.get(name);
    state.lastFingerprint.set(name, fingerprint);
    if (previousFingerprint !== fingerprint) continue; // still being written (or just appeared/changed) -- wait for the next poll to confirm it settled

    state.reported.add(key);
    try {
      await runConvert([fullPath], options);
    } catch (err) {
      options.logger.error(`Error converting ${name}: ${err instanceof Error ? err.message : String(err)}`);
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
  options.logger.log(`Watching ${folder} for new .3mf/.zip files (Ctrl+C to stop)...`);
  for (;;) {
    await watchPollOnce(folder, options, state);
    await sleep(WATCH_POLL_INTERVAL_MS);
  }
}
