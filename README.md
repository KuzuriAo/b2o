# b2o

Convert Bambu Studio, Creality Print, and Anycubic Slicer Next `.3mf` files to Snapmaker U1 / OrcaSlicer format from the command line.

This is the CLI counterpart to [bambu2orca](https://b2o.kuzuriao.com) — same conversion pipeline, same zero-mesh-upload guarantee, but scriptable instead of drag-and-drop. Only a small settings JSON (a few hundred slicer key/value pairs, plus bounding boxes) ever leaves your machine — **never** the 3D mesh geometry. That's not a policy promise, it's structural: run `--dry-run` on any file and see exactly what would be sent, with a byte count confirming zero mesh bytes, before you ever run it for real.

## Install

```bash
npm install -g @kuzuri.ao/b2o
# or, without installing anything:
npx @kuzuri.ao/b2o <command>
```

Either way, the installed command is just `b2o` — the package name is scoped, the command isn't.

## Quick start

```bash
b2o login you@example.com      # sends a magic-link email
# click the link, confirm, copy the revealed key
b2o key set                    # paste it when prompted (hidden input, never echoed)
b2o convert SpaceRobot.3mf     # -> SpaceRobot_U1.3mf
```

A key is free to get (self-serve, no payment) — see "API keys & quotas" below for the daily limit and how to raise it.

## Commands

### `b2o convert <files...> [options]`

Converts one or more local `.3mf` files. A file that's actually a zip bundling several `.3mf`s (e.g. a "download all variants" archive) is detected automatically and expanded into a batch — no separate flag needed. Files are processed **serially**, one at a time, never in parallel.

| Flag | Effect |
|---|---|
| `--profile <id>` | Force a specific profile instead of auto-detecting (run `b2o profiles` for valid ids) |
| `--filament-compliance <mode>` | `generic` or `snapmaker` — relabel filament identity for marketplace-compliance uploads (mirrors the web UI's filament brand picker). Identity only, never touches tuned physical properties (temps, retraction, flow); omit to keep the source file's original filament brand untouched |
| `--out-dir <dir>` | Write outputs to this directory instead of alongside each input |
| `--suffix <text>` | Output filename suffix, default `_U1` (pass `""` to remove it — refused if that would overwrite the input) |
| `--skip-existing` | Skip a file entirely (no network call) if its output already exists — for resuming an interrupted batch. Off by default: a normal run always overwrites, same as re-running a build |
| `--watch` | Watch `<files...>` (must be exactly one existing folder) for new `.3mf`/`.zip` files and convert each as it appears, running until Ctrl+C. Requires `--out-dir` pointing somewhere other than the watched folder — otherwise a freshly written output would get picked up as a "new" input on the next poll |
| `--archive-dir <dir>` | After a file fully converts, move the original there (collision-safe, atomic where possible). The cleanest way to keep a watched/cron-processed folder from ever needing to be rescanned |
| `--log-file <path>` | Append every log/error line (timestamped) to this file, in addition to stdout/stderr |
| `--quiet` | Suppress stdout/stderr entirely. Requires `--log-file` — refused otherwise, so an error never has nowhere to go |
| `--dry-run` | Parse and preview exactly what would be sent, with **zero** network calls or quota spent |
| `--verbose` | Show what's being sent immediately before a real conversion, plus the server's actual profile match afterward |
| `--api-base <url>` | Override the API base URL |

For a batch of several files, run with `--dry-run` first — it previews which profile each file will auto-match to (and clearly warns if a file can't be matched at all and would fall back to the default profile) without spending any quota, since `--dry-run` never calls the real rate-limited endpoint. One bad file (or one bad entry inside a bundle) never aborts the rest of a batch — each is handled independently.

Both `--dry-run` and `--verbose` write the complete request payload — every settings key, not just a count — to a `<name>.b2o-payload.json` file next to the output, since a real settings file easily has several hundred keys, too many to usefully print inline. That file is the actual, checkable proof behind the zero-mesh-upload claim.

```bash
b2o convert model.3mf --dry-run
b2o convert *.3mf --profile snapmaker-u1-0.4-standard --out-dir ./converted
b2o convert ./exports --watch --out-dir ./converted   # convert new files as they appear, until Ctrl+C
```

#### Processing a folder repeatedly (`--watch` or cron)

`--watch` isn't the only way to process a folder over time — everything below works identically from a plain (non-watch) `convert` call too, e.g. one triggered periodically by cron:

```bash
*/5 * * * *  b2o convert ./exports --archive-dir ./exports/done --out-dir ./converted --log-file ./b2o.log --quiet
```

Whenever `--watch`, `--archive-dir`, or `--skip-existing` is set (`--dry-run` is always exempt — it never has side effects to track), a small state file (`<out-dir or default dir>/.b2o-state.json`) records, per input, whether it fully succeeded or failed with a non-retryable error. It's keyed by name, size, **and modification time** together, so even a same-size content edit (e.g. fixing a typo in a plate name) is correctly seen as changed, not skipped. A non-retryable failure (a corrupt file, or the API rejecting the request itself) is skipped on future runs without retrying it forever; a transient one (the network being down, the server erroring, a rate limit) is always retried next time.

`--archive-dir` is the cleaner option when your workflow allows it — once a file fully converts, the original moves out of the watched/cron-scanned folder entirely, so there's nothing left to ever rescan (no repeated unzipping of large bundles, no state file needed for it at all). Use the state-file fallback above (`--skip-existing`, or `--watch` on its own) instead when the folder needs to keep its original files in place.

### `b2o profiles [--nozzle <mm>]`

Lists available conversion profiles — the CLI equivalent of the web UI's profile picker, so `convert --profile <id>` has somewhere to get a valid id from.

```bash
b2o profiles --nozzle 0.4
```

### `b2o login <email>`

Requests a magic-link email for an API key. Doesn't save anything locally — click the link in the email, then run `b2o key set` to save the key it reveals.

### `b2o key set` / `b2o key show [--reveal]`

`key set` prompts for your raw API key with hidden input — it's never accepted as a CLI argument, since arguments land in shell history and are visible to other processes via `ps` for the duration of the call. `key show` prints the saved key, masked by default (`--reveal` for the full value). The key is stored at `~/.b2o/config.json`, mode `0600` (owner read/write only).

## CI / build-pipeline use

Set the `B2O_API_KEY` environment variable instead of running `key set` interactively:

```bash
B2O_API_KEY=b2o_live_xxxxx npx @kuzuri.ao/b2o convert model.3mf --out-dir ./dist
```

`B2O_API_KEY` always takes priority over a saved config file when both are present. This is the path for a vendor's publish workflow, a CI job, or any other automated caller that has no terminal to answer an interactive hidden-input prompt against. If you're integrating this into a larger automated pipeline (e.g. regenerating profiles for an entire model catalog on publish), see "Beyond the CLI" below — the higher-quota org/vendor tier itself still isn't self-serve, so send a Ko-fi message via [ko-fi.com/b2o](https://ko-fi.com/b2o) to request promotion once you have a free key.

## Beyond the CLI

Everything here also works as a direct HTTP API call — no server to stand up, no Docker container, nothing to install beyond your own code making one request. Two docs cover this in depth:

- **[Vendor API Integration Guide](./docs/vendor-api-integration-guide.md)** — the full technical reference: request/response schemas, auth, rate limits, error codes, and the three ways to integrate (a visitor-facing handoff needing no API key at all, server-side automation, or your own admin UI).
- **[AI Agent Integration Brief](./docs/ai-agent-integration-brief.md)** — written to be handed directly to a coding agent (Claude Code or similar) working in your own site's codebase, alongside the guide above. It's the decision-and-action layer: investigate your own codebase, pick the integration shape that actually fits, then implement.

## API keys & quotas

| Tier | Daily quota | How to get it |
|---|---|---|
| Free | 10 conversions | `b2o login` (self-serve, no payment) |
| Ko-fi supporter | *varies by tier* | Same key, automatically upgraded — checked live against your Ko-fi supporter email on every request |
| Org/vendor | 2,000 conversions | No self-serve signup yet — get a free key first, then send a Ko-fi message via [ko-fi.com/b2o](https://ko-fi.com/b2o) to request promotion |

Each quota is a fixed daily limit on a rolling 24-hour window, not something you can adjust per-request — but the Ko-fi supporter number itself isn't one universal constant, since it comes from whichever Membership Tier is active on the account (e.g. `"Creator: 150 Converts/day"`, `"Studio: 300 Converts/day"`).

## Verifying the zero-mesh claim yourself

Don't take "only settings, never mesh" on faith. Three ways to check, in increasing order of rigor:

**1. `--dry-run`** — prints the exact object/key counts and an explicit "0 bytes of mesh geometry" line, and writes the full payload to `model.b2o-payload.json`, no network call made at all:
```bash
b2o convert model.3mf --dry-run
```

**2. Read the payload file** from a real run (`--verbose`, or any `--dry-run`) — every settings key, in full, one `cat`/`jq` away.

**3. Watch the actual decrypted network traffic** — the most rigorous option, since it doesn't rely on anything this tool says about itself. Set `HTTPS_PROXY` to a local [mitmproxy](https://mitmproxy.org/) instance:
```bash
mitmproxy -p 8080
# in another terminal:
HTTPS_PROXY=http://localhost:8080 b2o convert model.3mf
```
(trust mitmproxy's local CA cert once — it prints how on first run). This works because `b2o` explicitly wires `HTTPS_PROXY` support into every network call it makes; Node's own `fetch` doesn't respect that variable on its own. Plain `tcpdump`/Wireshark alone won't get you this — HTTPS encryption means a passive capture only shows packet sizes/metadata, not content, and (confirmed by testing) Node's `fetch` has no TLS-key-logging support to decrypt one after the fact. A local decrypting proxy is the way that actually works.

## License

[MIT](./LICENSE)
