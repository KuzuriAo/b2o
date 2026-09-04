/**
 * b2o/engine: browser-safe subpath entry point. No `node:*` builtins, no
 * `undici`, and deliberately no `convert()`/`requestApiKey()` -- the API
 * key belongs on the integrator's own server, so this entry can't make an
 * authenticated call at all.
 *
 * For integrators whose browser already holds the file bytes (a file
 * picker, drag-and-drop) and want to avoid round-tripping large meshes
 * through their own server: `prepareConvertRequest()` in the browser,
 * POST just the small resulting JSON to your own server route (which
 * holds the API key and calls this package's default export's
 * `convert()`), then `applyConvertResponse()` in the browser with what
 * your server route sends back. Mesh bytes never leave the browser tab.
 *
 * This is the exact same code bambu2orca's own web app runs client-side
 * (see packages/engine-client in the source repo) -- re-exported here
 * wholesale, not a hand-picked subset, since different integrators need
 * different pieces of it (a filament-color preview needs
 * `lookupFilamentColorName`; a custom viewer needs `objectWorldBboxXY`;
 * most integrations only need `prepareConvertRequest`/
 * `applyConvertResponse`/`unwrapIfBundle`). Unused exports cost nothing --
 * your own bundler tree-shakes whatever you don't call.
 *
 * Web Worker-safe: nothing in this module touches `document`/`window`/
 * `navigator`/the DOM, or any Node builtin -- confirmed directly against
 * the source, not assumed. Large files (megabytes of mesh) can run
 * through this entirely off the main thread.
 *
 * Types below are re-exported with `export type` specifically -- never as
 * a runtime import -- so the zod schemas that define them (a real
 * `shared` package dependency, used for actual request validation
 * server-side) never end up in a browser bundle built from this entry.
 * If you add a new re-export here, keep that distinction: type-only from
 * "shared", runtime-safe from "./internal/engine-client/index.js".
 */
export {
  adaptModelSettings,
  addOrcaSlicerMetadata,
  applyConvertResponse,
  applyTransform,
  compose,
  DROP_FROM_BAMBU,
  DROP_FROM_BAMBU_PATTERNS,
  fmtNum,
  lookupFilamentColorName,
  MODEL_SETTINGS_PATH,
  objectWorldBboxXY,
  parseFilamentType,
  parseItemPositions,
  parseMatrix,
  parsePlateAssignments,
  parseVertices,
  prepareConvertRequest,
  PROJECT_SETTINGS_PATH,
  recenterAssembleItems,
  recenterBuildItems,
  shouldDropFromBambu,
  SPECIAL_HANDLING,
  tolerantJsonParse,
  TOP_MODEL_PATH,
  unwrapIfBundle,
} from "./internal/engine-client/index.js";
export type {
  Bbox,
  BundleEntry,
  FilamentColorEntry,
  FilamentColorMatch,
  Mat3,
  ParsedBambuProject,
  TolerantJsonParseResult,
  Vec3,
} from "./internal/engine-client/index.js";

export type {
  ConfigFiles,
  ConvertObject,
  ConvertRequest,
  ConvertResponse,
  ErrorResponse,
  ProfileListResponse,
  ProfileSummary,
  ProjectSettings,
  Shifts,
} from "./internal/shared/index.js";
