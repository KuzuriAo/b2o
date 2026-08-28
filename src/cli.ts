// Shebang is added by esbuild's banner option at build time (see
// build.mjs), not here -- a literal shebang line in the .ts source would
// also survive tsc's declaration-only pass output unpredictably and, if
// ever bundled twice, produce two stacked shebang lines (invalid JS
// syntax past the first line).
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runConvert, runWatch, type ConvertOptions } from "./commands/convert.js";
import { runKeySet, runKeyShow } from "./commands/key.js";
import { runLogin } from "./commands/login.js";
import { createLogger } from "./logger.js";
import { runProfiles } from "./commands/profiles.js";
import { DEFAULT_BASE_URL } from "./convertClient.js";
import { formatTable } from "./table.js";

/** Renders a flag/description list with the flag column aligned -- reuses formatTable so help text alignment can't drift out of sync by hand-typed spacing. */
function formatOptions(entries: [flag: string, description: string][]): string {
  return formatTable(
    entries.map(([flag, description]) => [`  ${flag}`, description]),
    3,
  );
}

const TOP_LEVEL_HELP = `b2o -- convert Bambu Studio, Creality Print, and Anycubic Slicer Next .3mf files to Snapmaker U1 / OrcaSlicer format from the command line.

Usage: b2o <command> [options]

Commands:
${formatOptions([
  ["login <email>", "Request a magic-link email for an API key"],
  ["key set | show", "Save or view your API key"],
  ["profiles", "List available conversion profiles"],
  ["convert <files...>", "Convert one or more .3mf files (or bundle .zip files of several)"],
])}

Run "b2o <command> --help" for a command's full list of options.
`;

const LOGIN_HELP = `Usage: b2o login <email> [options]

Requests a magic-link email for an API key. Nothing is saved locally by
this command -- click the link in the email, then run "b2o key set" to
save the key it reveals.

Arguments:
${formatOptions([["<email>", "The email address to send the link to (required)"]])}

Options:
${formatOptions([
  ["--api-base <url>", `Override the API base URL (default: ${DEFAULT_BASE_URL})`],
  ["-h, --help", "Show this help"],
])}
`;

const KEY_HELP = `Usage: b2o key set
       b2o key show [options]

${formatOptions([
  ["set", "Prompts for your raw API key with hidden input (never accept it as a CLI argument -- arguments land in shell history)."],
  ["show", "Prints the saved key, masked by default."],
])}

Options (show only):
${formatOptions([
  ["--reveal", "Print the full, unmasked key"],
  ["-h, --help", "Show this help"],
])}

CI / build-pipeline use: set the B2O_API_KEY environment variable
instead of running "key set" interactively -- it always takes priority
over a saved key when both are present. Useful for a vendor's publish
workflow or any other non-interactive/automated caller that has no
terminal to answer a hidden-input prompt against.
`;

const PROFILES_HELP = `Usage: b2o profiles [options]

Lists available conversion profiles -- the CLI equivalent of the web
UI's profile picker, so "convert --profile <id>" has somewhere to get a
valid id from.

Options:
${formatOptions([
  ["--nozzle <mm>", "Only list profiles for this nozzle diameter, e.g. 0.4"],
  ["--api-base <url>", `Override the API base URL (default: ${DEFAULT_BASE_URL})`],
  ["-h, --help", "Show this help"],
])}
`;

const CONVERT_HELP = `Usage: b2o convert <files...> [options]

Converts one or more local .3mf files to Snapmaker U1 / OrcaSlicer
format. A file that's actually a zip bundling several .3mf files (e.g. a
"download all variants" archive) is detected automatically and expanded
into a batch -- no separate flag needed. Files are processed one at a
time, not in parallel.

Only a small settings JSON is ever sent over the network -- never mesh
geometry. Use --dry-run or --verbose to see exactly what that payload
contains for yourself, rather than taking that on faith.

Tip: for a batch of several files, run with --dry-run first. It previews
which profile each file will auto-match to -- and clearly warns when a
file couldn't be matched at all and would fall back to the server's
default profile -- without spending any of your API quota, since
--dry-run never calls the real (rate-limited) conversion endpoint.

Arguments:
${formatOptions([["<files...>", "One or more .3mf or bundle .zip files (required) -- or, with --watch, exactly one existing folder"]])}

Options:
${formatOptions([
  ["--profile <id>", 'Force a specific profile instead of auto-detecting (run "b2o profiles" to find a valid id)'],
  ["--filament-compliance <mode>", '"generic" or "snapmaker" -- relabel filament identity for marketplace-compliance uploads (e.g. Snapmaker Space, space.snapmaker.com). Identity only: never changes temps, retraction, flow, or other tuned physical properties. Omit to keep the source file\'s original filament brand/preset names untouched.'],
  ["--out-dir <dir>", "Write outputs to this directory instead of alongside each input"],
  ["--suffix <text>", 'Output filename suffix (default: "_U1"; pass "" to remove it -- refused if that would make the output path identical to the input file)'],
  ["--skip-existing", "Skip a file entirely (no network call) if its output already exists -- for resuming an interrupted batch. Off by default: a normal run always overwrites, same as re-running a build"],
  ["--watch", 'Watch <files...> (must be exactly one existing folder) for new .3mf/.zip files and convert each as it appears, running until Ctrl+C. Requires --out-dir pointing somewhere other than the watched folder'],
  ["--archive-dir <dir>", "After a file fully converts, move the original there (collision-safe, atomic where possible). The recommended way to keep a watched/cron-processed folder from ever needing to be rescanned -- see below"],
  ["--log-file <path>", "Append every log/error line (timestamped) to this file, in addition to stdout/stderr"],
  ["--quiet", "Suppress stdout/stderr entirely. Requires --log-file -- refused otherwise, so an error never has nowhere to go"],
  ["--dry-run", "Parse and show exactly what would be sent, without any network call or output file"],
  ["--verbose", "Show what's being sent immediately before a real conversion"],
  ["--api-base <url>", `Override the API base URL (default: ${DEFAULT_BASE_URL})`],
  ["-h, --help", "Show this help"],
])}

--dry-run and --verbose both write the complete request payload (every
settings key, not just a count) to a "<name>.b2o-payload.json" file next
to the output, since a real settings file easily has several hundred
keys -- too many to usefully print inline on every run, but one \`cat\`/
\`jq\` away for anyone who wants the full picture.

For an export pipeline or download folder that gets new files over time
rather than a fixed batch, --watch keeps running and converts each new
file as it appears (Ctrl+C to stop):
  b2o convert ./exports --watch --out-dir ./converted
--out-dir is required with --watch, and must be a different folder than
the one being watched -- otherwise a freshly written output would get
picked up as a "new" input on the next poll, converting its own output
forever.

--watch isn't the only way to process a folder repeatedly -- everything
below works identically from a plain (non-watch) convert call too, e.g.
one triggered periodically by cron:
  */5 * * * *  b2o convert ./exports --archive-dir ./exports/done --out-dir ./converted --log-file ./b2o.log --quiet

Whenever --watch, --archive-dir, or --skip-existing is set (--dry-run
never has side effects to track, so it's exempt), a small state file
(<out-dir or default dir>/.b2o-state.json) records, per input, whether it
fully succeeded or failed with a non-retryable error -- checked by name,
size, AND modification time together, so even a same-size content edit
(e.g. fixing a typo in a plate name) is correctly seen as changed, not
skipped. A failure classified as non-retryable (a corrupt file, or the
API rejecting the request itself) is skipped on future runs without
retrying it forever; a transient one (the network being down, the server
erroring, a rate limit) is always retried next time. One bad file no
longer aborts the rest of a batch either -- each is handled independently.

--archive-dir is the cleaner option when your workflow allows it: once a
file fully converts, the original moves out of the watched/cron-scanned
folder entirely, so there's nothing left to ever rescan -- no repeated
unzipping of large bundles, no state file needed for it at all. Use the
state-file fallback above (--skip-existing, or --watch on its own)
instead when the folder needs to keep its original files in place.

Don't want to take even that file on faith? Set HTTPS_PROXY to a local
mitmproxy instance and watch the actual decrypted HTTPS traffic:
  mitmproxy -p 8080
  HTTPS_PROXY=http://localhost:8080 b2o convert model.3mf
(trust mitmproxy's local CA cert once -- it prints how on first run).
This reads exactly what's on the wire, independent of anything this
tool claims about itself.
`;

function hasHelpFlag(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || hasHelpFlag([command])) {
    console.log(TOP_LEVEL_HELP);
    return;
  }

  switch (command) {
    case "login": {
      if (hasHelpFlag(rest)) {
        console.log(LOGIN_HELP);
        return;
      }
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { "api-base": { type: "string", default: DEFAULT_BASE_URL } },
      });
      const [email] = positionals;
      if (!email) throw new Error("Usage: b2o login <email> [--api-base <url>] (see: b2o login --help)");
      await runLogin(email, values["api-base"] ?? DEFAULT_BASE_URL);
      return;
    }

    case "key": {
      const [sub, ...subRest] = rest;
      if (!sub || hasHelpFlag([sub, ...subRest])) {
        console.log(KEY_HELP);
        return;
      }
      if (sub === "set") {
        await runKeySet();
        return;
      }
      if (sub === "show") {
        const { values } = parseArgs({ args: subRest, options: { reveal: { type: "boolean", default: false } } });
        runKeyShow(Boolean(values.reveal));
        return;
      }
      throw new Error("Usage: b2o key set | b2o key show [--reveal] (see: b2o key --help)");
    }

    case "profiles": {
      if (hasHelpFlag(rest)) {
        console.log(PROFILES_HELP);
        return;
      }
      const { values } = parseArgs({
        args: rest,
        options: { nozzle: { type: "string" }, "api-base": { type: "string", default: DEFAULT_BASE_URL } },
      });
      await runProfiles(values.nozzle, values["api-base"] ?? DEFAULT_BASE_URL);
      return;
    }

    case "convert": {
      if (hasHelpFlag(rest)) {
        console.log(CONVERT_HELP);
        return;
      }
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          profile: { type: "string" },
          "filament-compliance": { type: "string" },
          "out-dir": { type: "string" },
          suffix: { type: "string", default: "_U1" },
          "dry-run": { type: "boolean", default: false },
          verbose: { type: "boolean", default: false },
          "skip-existing": { type: "boolean", default: false },
          watch: { type: "boolean", default: false },
          "archive-dir": { type: "string" },
          "log-file": { type: "string" },
          quiet: { type: "boolean", default: false },
          "api-base": { type: "string", default: DEFAULT_BASE_URL },
        },
      });
      if (positionals.length === 0) throw new Error("Usage: b2o convert <files...> [options] (see: b2o convert --help)");
      const filamentCompliance = values["filament-compliance"];
      if (filamentCompliance !== undefined && filamentCompliance !== "generic" && filamentCompliance !== "snapmaker") {
        throw new Error(`--filament-compliance must be "generic" or "snapmaker", got "${filamentCompliance}" (see: b2o convert --help)`);
      }
      if (values.quiet && !values["log-file"]) {
        throw new Error("--quiet requires --log-file -- otherwise errors would have nowhere to go (see: b2o convert --help)");
      }
      const convertOptions: ConvertOptions = {
        profile: values.profile,
        filamentCompliance,
        outDir: values["out-dir"],
        archiveDir: values["archive-dir"],
        suffix: values.suffix ?? "_U1",
        dryRun: Boolean(values["dry-run"]),
        verbose: Boolean(values.verbose),
        skipExisting: Boolean(values["skip-existing"]),
        watch: Boolean(values.watch),
        baseUrl: values["api-base"] ?? DEFAULT_BASE_URL,
        logger: createLogger({ logFile: values["log-file"], quiet: Boolean(values.quiet) }),
      };

      if (values.watch) {
        if (positionals.length !== 1) throw new Error("--watch takes exactly one folder, not multiple paths (see: b2o convert --help)");
        const [folder] = positionals;
        if (!existsSync(folder) || !statSync(folder).isDirectory()) {
          throw new Error(`--watch requires an existing folder, got "${folder}" (see: b2o convert --help)`);
        }
        if (!convertOptions.outDir) {
          throw new Error("--watch requires --out-dir pointing somewhere other than the watched folder (see: b2o convert --help)");
        }
        if (resolve(convertOptions.outDir) === resolve(folder)) {
          throw new Error("--out-dir must be a different folder than the one being watched with --watch (see: b2o convert --help)");
        }
        await runWatch(folder, convertOptions);
        return;
      }

      await runConvert(positionals, convertOptions);
      return;
    }

    default:
      console.log(TOP_LEVEL_HELP);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
