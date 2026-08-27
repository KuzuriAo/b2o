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
