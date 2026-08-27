# Contributing to b2o

Thanks for considering a contribution — a couple of things worth knowing first.

## This repo is a synced export, not the primary development repo

b2o is developed inside a private monorepo (alongside the backend service it talks to), and this public repo is regenerated from that source at each release. That means a PR merged directly into this repo's `main` risks being silently overwritten the next time a release is synced, unless it's manually ported back into the private source first.

So: **open an issue before a PR** for anything beyond a trivial fix (typo, docs clarification) — that way the approach can be confirmed and ported back into the real source properly, rather than merging something that quietly vanishes on the next release. Small, self-contained fixes with a clear repro (a failing test is ideal) are the easiest to actually land. Anything under `src/internal/` (the vendored subset of the private monorepo's `engine-client`/`engine-server` packages) especially needs porting back rather than a direct merge, since that code's real home isn't this repo.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

All contributions are licensed under this repo's [MIT license](./LICENSE).
