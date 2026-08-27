# AI Agent Integration Brief: Adding bambu2orca to Your Web Stack

**Target:** an AI coding agent (Claude Code or similar) working in your own site's codebase, sent alongside a copy of the bambu2orca integration docs.
**Companion doc:** the Vendor API Integration Guide / CLI reference you were given alongside this brief — the full technical reference (request/response schemas, rate limits, error codes, both integration mechanisms in full). This brief is the decision-and-action layer on top of that reference, not a replacement for it. Don't duplicate its technical detail here — read it directly when you need it.
**Status:** Reusable across any site/stack — intentionally generic, doesn't assume any specific framework, UI pattern, or prior integration.

## What this is

bambu2orca converts Bambu Studio `.3mf` files to Snapmaker U1 / OrcaSlicer format. There are three genuinely different ways to integrate it into a web stack, and the right one depends on your actual goals and your site's actual architecture — not a default. This brief exists to help you investigate your own codebase, weigh the three options against what you find, and propose a concrete plan to the developer running this session, before writing any code.

## Step 1: Read the reference

Before anything else, read the companion doc's integration-shapes section (in the Vendor API Integration Guide, "Which integration fits your web stack?"). It lays out the three real shapes:

1. **Visitor-facing button** — no backend integration, no API key. The visitor's own browser sends the file straight to bambu2orca; nothing is stored or seen outside their browser session.
2. **Server-side automation** — your own backend holds an API key and calls bambu2orca directly (self-serve individual key for light use; a higher-quota org tier for automated/bulk use). Fits auto-generating a profile as part of publishing, or a bulk "Regenerate All" across a catalog.
3. **Your own admin UI** — the same server-side API as option 2, but wired into a UI you build and control. There's no pre-built admin widget shipped from bambu2orca's side, deliberately.

Full technical detail for all three lives in that guide — full request/response schemas, auth, rate limits, error codes. This brief only covers what's specific to *deciding* and *wiring in*, not the API contract itself.

## Step 2: Investigate this codebase

Don't default to a specific option — check what's actually here:
- Where (if anywhere) does this site already offer a download of the source `.3mf`? What does that flow look like — a plain `<a href>` link, a `fetch()`/`XMLHttpRequest` call, a form submit, something else? Is the file behind auth/cookies, or a plain publicly-readable URL?
- Is there an existing publish/ingestion pipeline (a CI job, an admin action, a CMS hook) that runs when a new model gets added, where auto-generating a U1 profile could slot in?
- Is there already an internal/admin area where a "regenerate this" or "regenerate all" action would naturally belong?

What you find here determines which of the three options actually fits — not the other way around.

## Step 3: If the visitor-facing handoff (option 1) looks like the fit

This is the one general pattern worth knowing up front, since the reasoning applies regardless of the specific site.

**If the download is served from a plain, cross-origin-readable URL** (no session/cookie gating): the simplest mechanism needs no JavaScript at all — just a link with a URL-encoded manifest. See the companion doc's "Mechanism A: URL manifest."

**If the file is fetched into memory client-side before being offered as a download** (a real `fetch()` call in the download handler, not a plain link): don't assume that fetched buffer is available to reuse elsewhere in the code — the existing handler might stream it straight to disk or hand it to a library without ever holding the full response somewhere reusable. The safer, decoupled approach is to independently repeat the same fetch and fully buffer it, triggered as a *sibling* action alongside the existing download — not a replacement for it, and not something that should delay or interfere with the normal download:

```js
async function convertToU1(downloadUrl, fileName) {
  // Independently re-fetches the same file the existing download already
  // requests -- deliberately decoupled from that handler's own
  // implementation, so this works regardless of how it's written.
  const res = await fetch(downloadUrl);
  const buffer = await res.arrayBuffer();

  const win = window.open("https://b2o.kuzuriao.com/?handoff=1&ref=<your-site-slug>", "_blank");

  const onReady = (event) => {
    if (event.data?.type !== "b2o-ready") return;
    window.removeEventListener("message", onReady);
    win.postMessage(
      { type: "b2o-import", files: [{ name: fileName, buffer }] },
      "https://b2o.kuzuriao.com",
    );
  };
  window.addEventListener("message", onReady);
}
```

Adapt this to wherever your actual download logic lives — don't paste it in blind. `ref=<your-site-slug>` is an optional attribution tag; replace it with a short slug identifying this site. If a "download all variants" feature already produces a single zip of several `.3mf` files, hand that off as one `files` entry — bambu2orca detects and unpacks a zip-of-3mfs into a batch automatically.

## Step 4: If server-side automation or a custom admin UI (option 2 or 3) looks like the fit

Both need a real API key — see the companion doc's "Getting an API key" section. Individual/free tier is self-serve. Automated/unattended use (a per-publish hook, a bulk regenerate) needs the higher-quota org tier, which isn't self-serve yet — getting one promoted requires a Ko-fi message via ko-fi.com/b2o. Flag this explicitly in your plan: it's a step the developer needs to take themselves, and it may take some time to complete, before the integration can be tested end-to-end.

## Step 5: Enter Plan Mode before implementing anything

Once you've read the reference and investigated this codebase, stop and present a plan — don't start writing code yet.

Your plan should cover:
- Which of the three options actually fits, and why — grounded in what you found in Step 2, not a generic default.
- If option 1: exactly where the handoff will be wired in (which file, which handler), matching the reasoning above.
- If option 2/3: what needs to happen first (the API key, org-tier promotion if needed) before the integration can be tested for real.
- What you'll verify once it's implemented — at minimum, confirm the site's existing behavior (downloads, publish pipeline, whatever's relevant) is completely unaffected when the new behavior isn't triggered, and works as expected when it is.

Get the developer's explicit approval before implementing. This is a real architectural decision — how much backend work, what ongoing dependency on bambu2orca's API, whether an API key needs provisioning — that only they can make for their own site.
