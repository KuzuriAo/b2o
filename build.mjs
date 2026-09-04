// Bundles the runnable JS artifacts with esbuild -- .d.ts files are
// produced separately by `tsc --emitDeclarationOnly` (see package.json's
// build script). This is genuinely needed, not optional: engine-client
// and shared were written for bundler-based consumption (Vite/Vitest),
// so their internal relative imports omit file extensions -- fine for a
// bundler's resolver, but Node's own native ESM loader requires explicit
// extensions and fails outright on a plain `tsc`-compiled, unbundled
// output. Bundling here also means this package doesn't depend on
// engine-client/shared as separate installable packages once it's ever
// extracted to its own repo -- their code is simply inlined.
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "dist",
  // `undici` (unlike engine-client/shared/engine-server) is a REAL,
  // independently-installable npm package and stays a real
  // package.json dependency -- inlining it would only bloat the
  // artifact (it alone is >1MB) for zero benefit, since npm installs it
  // fine on its own once this package is ever actually published.
  external: ["undici"],
  // engine-client/shared don't need re-checking here -- `tsc` (run
  // separately, see package.json) is the source of truth for type
  // errors; esbuild's job is only to produce runnable JS.
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: { cli: "src/cli.ts" },
  banner: { js: "#!/usr/bin/env node" },
});

await build({
  ...shared,
  entryPoints: { index: "src/index.ts" },
});

// Browser-safe subpath (`b2o/engine`, see src/engine.ts's own header for
// why this needs to be a separate entrypoint, not just a re-export from
// index.ts): platform "browser", not "node" -- unlike `shared` above,
// this is a real behavioral difference, not just a label. esbuild
// resolves `node:*` specifiers differently per platform and, critically,
// FAILS THE BUILD outright if this graph ever accidentally reaches one
// (import { X } from "engine-client" pulling in something that
// transitively imports node:fs, for instance) instead of silently
// bundling a Node-only module into something that'll break in a
// browser. That hard failure is the actual safety net here, not a
// formality -- keep this platform setting even if it never seems to
// matter locally.
await build({
  ...shared,
  platform: "browser",
  external: [],
  entryPoints: { engine: "src/engine.ts" },
});
