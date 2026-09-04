# Vendor API Integration Guide

**Audience:** developers (human or AI agent) integrating bambu2orca into a web stack — the complete reference, from a zero-backend visitor-facing button through to a fully automated, API-key-authenticated publish workflow.

**Scope:** this document is self-contained end-to-end for every real integration path — the visitor-facing browser handoff (no backend, no API key), the server-to-server API (authenticated, automated), and the hybrid split where your browser does the zip work and your own server just holds the key. Start at "Which integration fits your web stack?" below to pick a path, or read straight through if you're not sure yet. The browser handoff also has its own lighter, standalone write-up at the [Partner Handoff Integration Guide](./partner-handoff-integration-guide.md) — same mechanism, useful if you only need that piece and want to hand a shorter doc to a frontend-only team; that file is the canonical source if the two ever disagree.

If you're an AI agent implementing an integration from this document: every request/response shape and code sample below is copy-pasteable, not paraphrased — use it verbatim. The fastest paths to a working integration, depending on which shape you're building: the visitor-facing handoff needs no code at all beyond a link/postMessage call (see "The visitor-facing handoff, in full" below); for the server-side path, "Fastest path: shell out to the CLI" needs zero HTTP/zip code, and "Calling the API directly" → Step 2 has the full request/response schema if you need to call the API without depending on `b2o` at all; for the browser+your-server split, see option 4 below.

If you were handed an [AI Agent Integration Brief](./ai-agent-integration-brief.md) alongside this document, start there instead — it's the decision-and-action layer that tells you how to investigate your own codebase and pick between the four shapes above, then points back here for the technical detail once you know which one you're building.

---

## Which integration fits your web stack?

Four real shapes, depending on where in your stack the conversion should actually happen. Pick based on *who* triggers it and *where* the file already lives, not on what feels simplest to wire up first.

### 1. A visitor-facing button — no backend integration at all

For a plain "Convert to Snapmaker U1" call-to-action on a model page, this is the least you'll ever build: the visitor's own browser sends the file straight to bambu2orca, no API key, no backend code, nothing to deploy or maintain on your side. Full mechanism below in "The visitor-facing handoff, in full." This is the right answer if the goal is "let my visitors convert on demand," not "auto-generate a profile as part of publishing."

### 2. Server-side automation — what the rest of this document covers

Your own server — a publish-workflow script, a CI job, a Next.js Route Handler or Server Action, any backend context — holds the API key and calls bambu2orca. Three ways to do that, in order of how much you want to depend on `b2o`:
- Shell out to the `b2o` CLI as a subprocess (zero HTTP/zip code, see "Fastest path" below).
- `import { runConvert } from "@kuzuri.ao/b2o"` directly in a Node build step (same thing, in-process).
- Call `/v1/convert` over plain HTTP yourself (no dependency on `b2o` at all, if your stack isn't Node or you want full control — see "Calling the API directly").

This is the right shape for: auto-generating a U1 profile whenever a model publishes, an admin "Regenerate All" action across your whole catalog, a one-time historical backfill.

**The one rule that matters most here: the API key never reaches the browser.** It's a real credential carrying a real quota tied to your account (2,000 conversions/day at the org tier) — treat it exactly like a database password, not a public config value. Concretely: if a human clicks a button in your admin UI to trigger a regenerate, that button calls *your own* backend endpoint, and *that* endpoint is what holds the key (server env var / secret store) and calls bambu2orca — the key itself never appears in any client-side JS, network request the browser makes, or bundle you ship. A React component `fetch()`-ing bambu2orca's API directly from the browser would leak the key to anyone who opens DevTools.

### 3. Your own admin UI — built with your own stack, not ours

There's no pre-built "Regenerate U1 Profile" / "Regenerate All" widget shipped from our side, deliberately — not a gap to fill in later, a decision. Every admin panel has its own framework, design system, and layout conventions; a drop-in component from us would either clash with yours or need fighting into submission with overrides, and hardcoding one framework (React, say) doesn't generalize to the next integration that isn't on React at all. What we provide instead is everything needed to build exactly the UI that actually fits: the single documented `/v1/convert` endpoint (option 2 above), used the same way whether it's called once from a "Regenerate this profile" button or looped from a "Regenerate All" button — no separate bulk endpoint to learn either way.

Two things worth designing around, since they follow from how the underlying pipeline actually behaves, not from arbitrary UI opinion:
- **"Regenerate All" should show progress, not just a spinner.** Conversions are processed serially by design (see "A note on Regenerate All-style bulk runs" below), so a full-catalog run takes roughly N times as long as one model — a live "X of Y done" counter, updated as your own loop progresses, sets the right expectation instead of a UI that looks hung.
- **Track per-model completion so a regenerate can resume, not restart.** If your own backend loop logs which models it's already redone in the current run, an interrupted batch (a deploy, a timeout, a crash) picks back up instead of re-spending quota on models that already succeeded. The `b2o` CLI's own `--skip-existing` flag is the same idea applied to local files, if a concrete reference helps.

If you build something worth sharing back — even just describing the shape of it — that's real signal for whether a shared component would ever be worth building for real. Nothing about using bambu2orca depends on that happening, though.

### 4. Your browser does the zip work, your server holds the key

The shape that doesn't fit cleanly into "visitor-facing, no backend" or "server-side automation" above, but is the only one of the four that scales when files get large: your *own* server never touches mesh bytes, but it does hold the API key and make the authenticated call — the browser does the unzip/rebuild work, your server is purely a thin, key-holding proxy in between. This is exactly what bambu2orca's own web app does internally, just with your server standing in for our Worker.

Why this is worth its own shape rather than being "shape 2 with extra steps": shape 2's server-side paths (shelling out to the CLI, calling `runConvert()`, or hitting `/v1/convert` directly from your server) all assume the *file* reaches your server somehow — disk path, uploaded buffer, whatever. For a catalog of large files (tens to low hundreds of MB, not unusual for detailed multi-part models), that means pulling each one out of storage into your server/serverless function just to hand it straight back out again after conversion, for zero benefit — the visitor's browser already has the bytes in hand from a file picker or your own site's existing storage fetch. On a platform with a constrained `/tmp` (Vercel's serverless functions cap out around 512MB, shared across the whole invocation), a handful of large files in flight can matter; it also burns real egress moving mesh data through your infrastructure for a step that never needed to see it.

The fix: do the zip work in the browser instead, where the bytes already are.

```ts
// Browser: unzip in memory, build the small settings-only request. No node:*
// builtins, no undici — safe in a bundle, safe off the main thread in a
// Web Worker for a large file.
import { prepareConvertRequest, applyConvertResponse } from "@kuzuri.ao/b2o/engine";

const parsed = prepareConvertRequest(fileBytes);

// POST just parsed.request (small JSON, never mesh data) to YOUR server route.
const response = await fetch("/api/convert-u1", {
  method: "POST",
  body: JSON.stringify(parsed.request),
}).then((r) => r.json());

// Browser: reassemble the final downloadable file from the response.
const outputBytes = applyConvertResponse(parsed, response);
```

```ts
// Your server route (Next.js Route Handler, or equivalent): holds the API
// key, makes the one authenticated call, nothing else. Never sees mesh
// bytes -- the request body here is the same small JSON `runConvert()`
// would build from a local file, just arriving over the wire instead.
import { convert } from "@kuzuri.ao/b2o";

export async function POST(req: Request) {
  const convertRequest = await req.json();
  const response = await convert(convertRequest, process.env.B2O_API_KEY!);
  return Response.json(response);
}
```

Mesh geometry never leaves the visitor's browser tab in either direction — your server forwards a settings-only JSON payload through and a settings-only JSON payload back, the same zero-mesh-upload guarantee bambu2orca's own web app makes, just with your infrastructure standing in the middle instead of ours. File size stops being a server-side concern at all: a 150MB source costs your `/api/convert-u1` route nothing beyond forwarding a request body a few hundred KB in size.

Full reference for the browser-side half: [`@kuzuri.ao/b2o`'s README, "Browser-side use"](https://github.com/KuzuriAo/b2o#browser-side-use-kuzuriaob2oengine). The server-side half is exactly "Calling the API directly" → Step 2 below, or `convert()` from "Fastest path," just receiving its request body from your own browser code instead of building it from a local file.

---

## The visitor-facing handoff, in full

A visitor on your site clicks "Convert to Snapmaker U1," and lands on `b2o.kuzuriao.com` with their file (or files) already loaded into the normal converter UI — no re-upload, no separate account, **no API key**. This is not a server-to-server call: your backend never sends a file to bambu2orca, and nothing about it is stored or seen outside the visitor's own browser session. bambu2orca's entire architecture depends on mesh data never leaving the browser — this integration preserves that exactly: the visitor's browser is the only thing that ever touches the file bytes, from your site through to the finished download.

Two ways to hand off a file, depending on how your site already serves them.

### Mechanism A: URL manifest

Send the visitor to:
```
https://b2o.kuzuriao.com/?manifest=<url-encoded-JSON>&ref=<your-id>
```
where the manifest is a JSON array, one entry per file:
```json
[
  { "url": "https://yourcdn.example/download/abc123", "name": "SpaceRobot.3mf" }
]
```
(several entries for a multi-file batch — same shape either way). On load, the visitor's browser fetches each URL directly and feeds the result into the normal upload flow, exactly as if they'd dragged the file in themselves.

**Requirements on your side:**
- Each URL must be readable cross-origin by `b2o.kuzuriao.com` — your file host needs a CORS policy allowing our origin to read the response. If your download endpoint is session/cookie-gated, a plain cross-origin fetch likely won't carry your auth; a short-lived, pre-signed/tokenized URL that doesn't depend on cookies is the standard way around that.
- If your endpoint treats "being fetched" as *the* download for tracking/invalidation purposes, give this flow its own URL/scope so it doesn't double-count against, or invalidate, a visitor's normal direct-download link.
- On failure (CORS blocked, expired link, 404), the visitor sees a clear error with a fallback suggestion to download and drag the file in manually — nothing fails silently.

### Mechanism B: `postMessage` handoff (no CORS required)

If your files are generated per-request (e.g. with an embedded per-user watermark) and your own page already fetches the file into memory before offering it as a download, this is usually the simpler integration — no CORS changes needed on your end at all.

1. Your page fetches the file the way it already does today (same-origin, whatever embeds your watermark/auth).
2. Open a new tab: `const win = window.open("https://b2o.kuzuriao.com/?handoff=1&ref=<your-id>", "_blank")`.
3. Wait for that tab to signal it's ready:
   ```js
   window.addEventListener("message", function onReady(event) {
     if (event.data?.type !== "b2o-ready") return;
     window.removeEventListener("message", onReady);
     win.postMessage(
       { type: "b2o-import", files: [{ name: "SpaceRobot.3mf", buffer: fileArrayBuffer }] },
       "https://b2o.kuzuriao.com",
     );
   });
   ```
4. That's it — the new tab takes it from there, exactly like Mechanism A.

For a multi-file batch, include every file in the `files` array in one message.

### The `ref` parameter

Optional, but recommended: a short slug identifying your site (letters, numbers, `-`, `_` only, 64 characters max — e.g. `"your-site-name"`). This has no effect on the conversion itself; it's purely so the bambu2orca site owner can see which partner sites are actually driving conversions. Not shared publicly, not joined with any per-visitor data. It's the same idea as the `referrer` field in the API request schema below (see "Calling the API directly") — one identity, two entry points, whichever integration path you use.

### What happens after handoff

Nothing partner-specific — the visitor is now just using bambu2orca normally: pick a quality profile (or let it auto-detect), hit convert, download the result. Usage counts against the same free/supporter daily limits as any other visitor; there's no separate partner quota, and nothing about this flow is tied to your site's identity beyond the optional `ref` tag. Worth being explicit about since this document also covers API keys: **a visitor using the handoff never touches your org-tier API quota at all** — it's a genuinely separate pool, keyed by IP/cookie like any other anonymous visitor.

### Zip bundles

If your "download all variants" feature already zips several `.3mf` files into one archive, you can hand that off as-is (as a single `manifest`/`postMessage` entry) — bambu2orca detects a zip containing multiple `.3mf` siblings and unpacks it into a batch automatically, same as it would for a single file.

---

## What actually leaves your server

Only a small settings JSON: the parsed contents of `Metadata/project_settings.config` (a few hundred slicer settings, all plain key/value pairs) plus each object's bounding box or fallback translation. **Never mesh geometry.** This isn't a policy promise you have to trust — it's structural: nothing in the request schema below has a field capable of holding vertex data, and the reference implementation (`engine-client`'s `prepareConvertRequest`, see below) simply never reads any mesh-bearing archive entry in the first place.

**Verify this yourself rather than take it on faith** — given you're about to point an entire catalog's worth of models at this, that's a reasonable thing to want to check before you do. If you're using the `b2o` package: `--dry-run` (or `--verbose`) writes the complete request payload to a file, no parsing required. For the most rigorous check — reading the actual bytes on the wire, independent of anything this tool or doc claims — set `HTTPS_PROXY` to a local [mitmproxy](https://mitmproxy.org/) instance:
```bash
mitmproxy -p 8080
HTTPS_PROXY=http://localhost:8080 b2o convert model.3mf   # or your own fetch-based integration
```
`b2o` explicitly wires `HTTPS_PROXY` into every request it makes (Node's own `fetch` doesn't respect that variable on its own — confirmed by testing directly, including checking whether TLS key-logging could decrypt a plain `tcpdump` capture after the fact; it can't, undici has no support for that). A local decrypting proxy is the only approach that actually shows plaintext content, not just packet sizes.

## Getting an API key

1. **Individual tier** (free, self-serve): `POST /v1/api-keys/request` with `{ "email": "you@example.com" }` triggers a magic-link email. Click the link, and the confirm page reveals a raw key exactly once (`b2o_live_...`) — store it, it can't be retrieved again, only rotated (request again with the same email; the old key stops working immediately). Free tier is 10 conversions/day; a Ko-fi-supporter email bumps that to whatever their active Membership Tier's quota is (varies by tier, re-checked live on every request — see "Rate limits" below).
2. **Org/vendor tier** (2,000 conversions/day, flat, fixed): there's no self-serve signup for this tier yet. Get the individual/free key above first, then send a Ko-fi message via [ko-fi.com/b2o](https://ko-fi.com/b2o) with the email you registered and your site/integration name, and it'll be promoted manually. Ask for this tier if your integration runs unattended in a build pipeline and might process many models in one run (e.g. a full-catalog regenerate).

Either way, you end up with one raw key. Treat it like a password — see "CI / build-pipeline use" below for how to supply it non-interactively.

## Authentication

Every request to `/v1/convert` carries the key in a header:
```
X-Api-Key: b2o_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
This is a server-to-server call — there's no browser involved, so CORS doesn't apply and there's no Turnstile/captcha step. An unknown or malformed key gets `401 invalid_api_key`.

---

## Fastest path: shell out to the CLI

If your publish workflow can run a Node subprocess, this is the least code you'll ever write for this integration — the `b2o` CLI already does the full round-trip (extract settings from the source `.3mf`, call the API, stitch the result back into a real `.3mf`) in one command. The npm package is published as `@kuzuri.ao/b2o` (scoped, due to an npm anti-squatting rule on short unscoped names), but the installed command itself is still just `b2o`:

```bash
B2O_API_KEY=b2o_live_xxxxx npx @kuzuri.ao/b2o convert ./models/my-model.3mf --out-dir ./dist
# -> ./dist/my-model_U1.3mf
```

`B2O_API_KEY` always takes priority over any saved config, and needs no interactive setup at all — this is exactly the non-interactive path a CI job or build script needs (`b2o key set`'s hidden-input prompt has no terminal to run against in that context). Useful flags for an automated run:

- `--profile <id>` — force a specific profile instead of auto-detecting (see "Listing available profiles" below for valid ids). Recommended for a "regenerate all with a known-good profile" run.
- `--filament-compliance <generic|snapmaker>` — relabel filament identity for [Snapmaker Space](https://space.snapmaker.com/) and marketplace-compliance uploads (same `filamentComplianceMode` field documented in the request schema below). Identity only, never touches tuned physical properties.
- `--out-dir <dir>` — write outputs to a specific directory.
- `--suffix <text>` — customize the output filename suffix (default `_U1`).
- `--dry-run` — parse and preview the match/payload for every file with **zero** API calls or quota spent. Run this over your whole catalog first to confirm every model resolves to a sane profile before actually spending real conversions on a live run.

Run `npx @kuzuri.ao/b2o convert --help` for the full option list, or `npx @kuzuri.ao/b2o profiles` to list valid `--profile` ids.

If you're already in a Node build step and would rather not spawn a subprocess, `b2o` is also importable as a library — `runConvert(inputPaths, options)` is the exact function the CLI itself calls, doing the same full round-trip in-process:

```typescript
import { runConvert } from "@kuzuri.ao/b2o";

await runConvert(["./models/my-model.3mf"], {
  outDir: "./dist",
  suffix: "_U1",
  dryRun: false,
  verbose: false,
  skipExisting: false, // true resumes an interrupted batch without redoing already-converted files
  baseUrl: "https://b2o.kuzuriao.com",
  // profile: "snapmaker-u1-0.4-standard", // optional, force a specific profile
});
```
It reads the key from `B2O_API_KEY`/the config file the same way the CLI does. `listProfiles`/`convert`/`requestApiKey` (the lower-level API client functions) are also exported individually, if you want the HTTP calls without the file-handling/CLI-output parts.

Only reach for "Calling the API directly" below if you're not in a position to depend on the `b2o` package at all (a non-Node toolchain, for instance) — everything in that section is what `b2o` already does for you.

---

## Calling the API directly

### Step 1: Extract the request payload from your source `.3mf`

A Bambu Studio, Creality Print, or Anycubic Slicer Next `.3mf` is a zip -- all three share the same underlying format (Creality Print and Anycubic Slicer Next are both recent OrcaSlicer-lineage forks). You need two things out of it:
1. `Metadata/project_settings.config`, parsed as JSON, sent verbatim as `projectSettings`.
2. Each top-level object's plate assignment and world-space bounding box (or fallback translation), sent as `objects`.

**Computing the bounding box correctly is the hard part** — it requires walking the model's full transform hierarchy, and getting it wrong produces a subtly-misaligned print, not an obvious error. This logic isn't published as a standalone dependency; it's what `b2o`'s own `runConvert` does internally (see above). Reimplementing it from scratch is a real undertaking, not recommended unless you truly can't depend on `b2o` at all.

### Step 2: `POST /v1/convert`

```
POST https://b2o.kuzuriao.com/v1/convert
X-Api-Key: b2o_live_xxxxx
Content-Type: application/json
```

Full request schema:

```typescript
{
  projectSettings: Record<string, unknown>;  // required -- the raw parsed project_settings.config JSON
  objects: Array<{
    id: string;                               // required
    name?: string;
    sequence?: number;
    isAssembly?: boolean;
    plate?: number;                           // omitted if the object has no plate metadata
    bbox: [number, number, number, number] | null;  // [minX, maxX, minY, maxY], or null if no mesh was found
    fallbackXy?: [number, number];            // sent only when bbox is null
  }>;
  profileId?: string;                         // omit to auto-detect (see Step 3 below on checking the result)
  filamentComplianceMode?: "generic" | "snapmaker";  // omit to leave filament identity untouched
  referrer?: string;                          // optional attribution slug, ^[a-zA-Z0-9_-]+$, max 64 chars
  // supporterEmail is for the anonymous/browser flow only -- irrelevant here, omit it.
}
```

Full response schema (`200`):

```typescript
{
  projectSettings: Record<string, unknown>;   // the merged/converted settings -- write this back as Metadata/project_settings.config
  configFiles: Record<string, Record<string, unknown>>;  // other Metadata/*.config files to write verbatim, keyed by archive path
  shifts: Record<string, [number, number]>;   // objectId -> [dx, dy] recentering shift to apply to that object's transform
  orcaSlicerVersion: string;                  // written into the output's OrcaSlicer metadata tag
  profileMatch?: {                            // present whenever profileId wasn't given explicitly -- see below
    profileId: string;
    nozzleDiameter: string;
    exact: boolean;
    matchedByTierName: boolean;
    matchSource: "auto-tier-name" | "auto-exact" | "auto-nearest" | "default-fallback";
  };
  filamentComplianceFallback?: string[];      // materials that fell back to Generic (filamentComplianceMode: "snapmaker" only)
  warnings?: string[];                        // human-readable notes, e.g. "plate exceeds printable area"
}
```

### Step 3: Check `profileMatch.matchSource` if you didn't pass `profileId`

This is the one field worth actually branching on in automated use. `"auto-exact"` and `"auto-tier-name"` are confident matches — the source file's own layer height or tier name lined up exactly with an available profile. `"auto-nearest"` means it picked the closest available layer height, not an exact one — usually fine, but worth logging. **`"default-fallback"` means no reasonable match could be found at all** (nozzle diameter undetectable, or a detected diameter with no matching candidate) — `profileId` in that case is just the server's generic default, not a real match for your model, and silently accepting it risks shipping a mismatched profile. For a "regenerate all" run, either fail loudly on `default-fallback` and flag that model for manual review, or pass an explicit `profileId` for every call instead of relying on auto-detection at all.

### Step 4: Reassemble the output `.3mf`

Take the original zip's untouched entries, overwrite `Metadata/project_settings.config` with the response's `projectSettings`, write each entry in `configFiles` verbatim, and apply `shifts` to each object's transform in `Metadata/model_settings.config`. This is XML surgery over the model-settings file plus exact byte-for-byte preservation of every untouched archive entry, not just a JSON merge — same caveat as step 1: this is what `b2o`'s `runConvert` already does for you, and is the harder half of reimplementing this integration from scratch.

---

## Listing available profiles

```
GET https://b2o.kuzuriao.com/v1/profiles[?diameter=0.4]
```
No auth required — this is public catalog data. Returns:
```typescript
{ profiles: Array<{
    id: string;              // pass this as `profileId` in a /v1/convert request
    displayName: string;     // e.g. "0.20 Standard @Snapmaker U1 (0.4 nozzle)"
    printerId: string;
    nozzleDiameter: string;
    layerHeight: number;
    autoSelectable: boolean; // false for a tier that ties on layer height with another -- auto-detection never picks these, only explicit profileId can
    tierName: string;        // e.g. "Standard", "Extra Fine"
  }>
}
```
Use this to build a `profileId` picker in your own admin tooling, or just to look up a valid id to pass explicitly.

## Rate limits

| Tier | Limit | Window | How assigned |
|---|---|---|---|
| Individual, free | 10 | rolling 24h | default for any new key |
| Individual, supporter | *varies by tier* | rolling 24h | live Ko-fi-supporter check on the key's email, re-checked every request |
| Org/vendor | 2,000 | rolling 24h | manual promotion via Ko-fi message (see "Getting an API key" above) |

The individual-supporter limit isn't one fixed number — each Ko-fi Membership Tier on `ko-fi.com/b2o` carries its own quota (named e.g. `"Creator: 150 Converts/day"`, `"Studio: 300 Converts/day"`), and whichever tier is currently active for that email is what applies, live, on every request.

None of these are caller-adjustable, though — there's no request-side flag or header that raises your own limit, at any tier. Exceeding it returns `429 rate_limited`; the count resets on a rolling 24h window (not midnight-aligned), so retry after waiting rather than polling for a fixed reset time. The limit counts every *attempt* (including ones that error out), not just successes, so a malformed request still costs quota — worth getting your payload right before looping over a full catalog.

## Error codes

| HTTP status | `error.code` | Meaning |
|---|---|---|
| 400 | `invalid_json` | Request body isn't valid JSON |
| 400 | `invalid_request` | Body doesn't match the schema above (`error.message` has the specific validation failure) |
| 401 | `invalid_api_key` | Missing, unknown, or revoked/rotated-away key |
| 404 | `profile_not_found` | An explicit `profileId` doesn't exist |
| 429 | `rate_limited` | Tier quota exceeded (see above) |
| 500 | `conversion_failed` | Unexpected pipeline error — safe to retry once; if it persists, it's worth reporting |

Every error response has the shape `{ "error": { "code": string, "message": string } }`.

## A note on "Regenerate All"-style bulk runs

Process models **serially**, one request at a time, not in parallel. Two reasons: it avoids write-contention on the shared rate-limit counter under a concurrent burst, and it keeps failure/resume trivial — if a bulk run is interrupted, whichever model was last logged tells you exactly where to resume, with no partial-batch bookkeeping needed. This is deliberate, not a current limitation to work around; it's the same approach the `b2o` CLI itself uses internally for a multi-file `convert` call.
