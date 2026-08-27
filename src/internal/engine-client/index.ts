/**
 * engine-client: browser-side geometry, zip-entry, and XML-surgery
 * functions ported from `bbs2u1.py`.
 *
 * Owned by the backend/engine side of this project (see AGENTS.md) even
 * though everything here runs in the browser — this is correctness-critical
 * port work (byte-for-byte parity with the Python reference implementation),
 * not UI. It is also the public interface the frontend (apps/web) calls
 * into, so every exported function is fully JSDoc'd.
 */

export { adaptModelSettings } from "./adaptModelSettings.js";

export { addOrcaSlicerMetadata } from "./addOrcaSlicerMetadata.js";

export { fmtNum } from "./fmtNum.js";

export { lookupFilamentColorName, parseFilamentType } from "./lookupFilamentColorName.js";
export type { FilamentColorEntry, FilamentColorMatch } from "./lookupFilamentColorName.js";

export { objectWorldBboxXY } from "./objectWorldBboxXY.js";
export type { Bbox } from "./objectWorldBboxXY.js";

export { parseItemPositions } from "./parseItemPositions.js";

export { parsePlateAssignments } from "./parsePlateAssignments.js";

export { PROJECT_SETTINGS_PATH, MODEL_SETTINGS_PATH, TOP_MODEL_PATH, SPECIAL_HANDLING } from "./paths.js";

export { parseVertices } from "./parseVertices.js";

export { recenterAssembleItems } from "./recenterAssembleItems.js";

export { recenterBuildItems } from "./recenterBuildItems.js";

export { DROP_FROM_BAMBU, DROP_FROM_BAMBU_PATTERNS, shouldDropFromBambu } from "./shouldDropFromBambu.js";

export { tolerantJsonParse } from "./tolerantJsonParse.js";
export type { TolerantJsonParseResult } from "./tolerantJsonParse.js";

export { unwrapIfBundle } from "./unwrapBundle.js";
export type { BundleEntry } from "./unwrapBundle.js";

export { applyTransform, compose, parseMatrix } from "./transform.js";
export type { Mat3, Vec3 } from "./transform.js";

export { applyConvertResponse, prepareConvertRequest } from "./zip.js";
export type { ParsedBambuProject } from "./zip.js";
