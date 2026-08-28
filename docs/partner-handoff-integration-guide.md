# Partner Handoff Integration Guide

**Audience:** developers at creator/marketplace sites integrating a "Convert to Snapmaker U1" action against bambu2orca.

This is the canonical, standalone reference for this one mechanism. If you're also considering (or building) a server-side/API-key integration — auto-generating a profile at publish time, an admin "Regenerate All" — see the [Vendor API Integration Guide](./vendor-api-integration-guide.md) instead, which includes this same content in full alongside that path, plus a decision guide for which shape actually fits your stack.

## What this is

A visitor on your site clicks "Convert to Snapmaker U1," and lands on `b2o.kuzuriao.com` with their file (or files) already loaded into the normal converter UI — no re-upload, no separate account, no API key. This is **not** a server-to-server API: your backend never sends us a file, and we never store or see your file outside the visitor's own browser session. bambu2orca's entire architecture depends on mesh data never leaving the browser — this integration preserves that exactly: the visitor's browser is the only thing that ever touches the file bytes, from your site through to the finished download.

Two ways to hand off a file, depending on how your site already serves them.

## Mechanism A: URL manifest

Send the visitor to:
```
https://b2o.kuzuriao.com/?manifest=<url-encoded-JSON>&ref=<your-id>
```
where the manifest is a JSON array, one entry per file:
```json
[
  { "url": "https://yourcdn.example/download/abc123", "name": "AMS.3mf" }
]
```
(several entries for a multi-file batch — same shape either way). On load, the visitor's browser fetches each URL directly and feeds the result into the normal upload flow, exactly as if they'd dragged the file in themselves.

**Requirements on your side:**
- Each URL must be readable cross-origin by `b2o.kuzuriao.com` — your file host needs a CORS policy allowing our origin to read the response. If your download endpoint is session/cookie-gated, a plain cross-origin fetch likely won't carry your auth; a short-lived, pre-signed/tokenized URL that doesn't depend on cookies is the standard way around that.
- If your endpoint treats "being fetched" as *the* download for tracking/invalidation purposes, give this flow its own URL/scope so it doesn't double-count against, or invalidate, a visitor's normal direct-download link.
- On failure (CORS blocked, expired link, 404), the visitor sees a clear error with a fallback suggestion to download and drag the file in manually — nothing fails silently.

## Mechanism B: `postMessage` handoff (no CORS required)

If your files are generated per-request (e.g. with an embedded per-user watermark) and your own page already fetches the file into memory before offering it as a download, this is usually the simpler integration — no CORS changes needed on your end at all.

1. Your page fetches the file the way it already does today (same-origin, whatever embeds your watermark/auth).
2. Open a new tab: `const win = window.open("https://b2o.kuzuriao.com/?handoff=1&ref=<your-id>", "_blank")`.
3. Wait for that tab to signal it's ready:
   ```js
   window.addEventListener("message", function onReady(event) {
     if (event.data?.type !== "b2o-ready") return;
     window.removeEventListener("message", onReady);
     win.postMessage(
       { type: "b2o-import", files: [{ name: "AMS.3mf", buffer: fileArrayBuffer }] },
       "https://b2o.kuzuriao.com",
     );
   });
   ```
4. That's it — the new tab takes it from there, exactly like mechanism A.

For a multi-file batch, include every file in the `files` array in one message.

## The `ref` parameter

Optional, but recommended: a short slug identifying your site (letters, numbers, `-`, `_` only, 64 characters max — e.g. `"your-site-name"`). This has no effect on the conversion itself; it's purely so the bambu2orca site owner can see which partner sites are actually driving conversions. Not shared publicly, not joined with any per-visitor data.

## What happens after handoff

Nothing partner-specific — the visitor is now just using bambu2orca normally: pick a quality profile (or let it auto-detect), hit convert, download the result. Usage counts against the same free/supporter daily limits as any other visitor; there's no separate partner quota, and nothing about this flow is tied to your site's identity beyond the optional `ref` tag.

## Zip bundles

If your "download all variants" feature already zips several `.3mf` files into one archive, you can hand that off as-is (as a single `manifest`/`postMessage` entry) — bambu2orca detects a zip containing multiple `.3mf` siblings and unpacks it into a batch automatically, same as it would for a single file.
