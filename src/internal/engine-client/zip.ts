import { unzipSync, zipSync } from "fflate";
import type { ConvertObject, ConvertRequest, ConvertResponse } from "../shared/index.js";
import { adaptModelSettings } from "./adaptModelSettings.js";
import { addOrcaSlicerMetadata } from "./addOrcaSlicerMetadata.js";
import { objectWorldBboxXY } from "./objectWorldBboxXY.js";
import { parseItemPositions } from "./parseItemPositions.js";
import { MODEL_SETTINGS_PATH, PROJECT_SETTINGS_PATH, SPECIAL_HANDLING, TOP_MODEL_PATH } from "./paths.js";
import { parseObjectMetadata } from "./parseObjectMetadata.js";
import { parsePlateAssignments } from "./parsePlateAssignments.js";
import { recenterAssembleItems } from "./recenterAssembleItems.js";
import { recenterBuildItems } from "./recenterBuildItems.js";
import { shouldDropFromBambu } from "./shouldDropFromBambu.js";
import { tolerantJsonParse } from "./tolerantJsonParse.js";

const utf8Decoder = new TextDecoder("utf-8");
const utf8Encoder = new TextEncoder();

export interface ParsedBambuProject {
  /** The full decompressed source zip, kept for applyConvertResponse's final reassembly. */
  zipEntries: Record<string, Uint8Array>;
  /** The /v1/convert request payload to POST. */
  request: ConvertRequest;
  /** Non-fatal notes collected while parsing (e.g. tolerantJsonParse's trailing-content note), for surfacing in the UI. */
  warnings: string[];
}

/**
 * Unzip a Bambu Studio .3mf (already in memory as bytes -- the mesh never
 * gets uploaded anywhere) and build the /v1/convert request payload: the
 * full project_settings.config JSON, plus each top-level object's
 * world-space bounding box (or its raw transform translation as a
 * fallback when mesh geometry is missing), its plate assignment, and its name.
 */
export function prepareConvertRequest(fileBytes: Uint8Array): ParsedBambuProject {
  const zipEntries = unzipSync(fileBytes);
  const warnings: string[] = [];

  const projectSettingsBytes = zipEntries[PROJECT_SETTINGS_PATH];
  if (!projectSettingsBytes) {
    throw new Error(`Missing ${PROJECT_SETTINGS_PATH} in the uploaded 3MF.`);
  }

  const { value: projectSettings, trailingText } = tolerantJsonParse(
    utf8Decoder.decode(projectSettingsBytes),
  );
  if (trailingText.trim()) {
    warnings.push(
      `  (note: ignored ${trailingText.length} bytes of trailing non-JSON content after project_settings.config, e.g. ${JSON.stringify(trailingText.slice(0, 60))})`,
    );
  }

  const topModelBytes = zipEntries[TOP_MODEL_PATH];
  if (!topModelBytes) {
    throw new Error(`Missing ${TOP_MODEL_PATH} in the uploaded 3MF.`);
  }
  const topModelText = utf8Decoder.decode(topModelBytes);

  const modelSettingsBytes = zipEntries[MODEL_SETTINGS_PATH];
  const modelSettingsText = modelSettingsBytes ? utf8Decoder.decode(modelSettingsBytes) : "";

  const itemPositions = parseItemPositions(topModelText);
  const plateAssignments = modelSettingsText ? parsePlateAssignments(modelSettingsText) : {};
  const objectMetadata = parseObjectMetadata(topModelText, modelSettingsText);

  const partFileCache = new Map<string, string>();
  const objects: ConvertObject[] = Object.entries(itemPositions).map(([id, fallbackXy]) => {
    const bbox = objectWorldBboxXY(id, topModelText, partFileCache, zipEntries);
    const plate = plateAssignments[id];
    const meta = objectMetadata[id];
    return {
      id,
      ...(meta?.name ? { name: meta.name } : {}),
      ...(meta?.sequence !== undefined ? { sequence: meta.sequence } : {}),
      ...(meta?.isAssembly !== undefined ? { isAssembly: meta.isAssembly } : {}),
      ...(plate !== undefined ? { plate } : {}),
      ...(bbox ? { bbox } : { bbox: null, fallbackXy }),
    };
  });

  return {
    zipEntries,
    request: { projectSettings: projectSettings as ConvertRequest["projectSettings"], objects },
    warnings,
  };
}

/**
 * Apply a /v1/convert response to the originally parsed project and
 * produce the final Snapmaker Orca .3mf bytes, ready to offer as a
 * download. Copies every untouched zip entry verbatim (dropping
 * Bambu-only files per shouldDropFromBambu), adds the OrcaSlicer origin
 * metadata tag and recenters the build/assemble transforms using the
 * response's shift map, adapts model_settings.config, and writes the
 * response's merged project_settings.config plus every generated/
 * passthrough config file.
 */
export function applyConvertResponse(parsed: ParsedBambuProject, response: ConvertResponse): Uint8Array {
  const { zipEntries, warnings } = parsed;
  const outputEntries: Record<string, Uint8Array> = {};

  for (const [name, data] of Object.entries(zipEntries)) {
    if (shouldDropFromBambu(name) || SPECIAL_HANDLING.has(name)) continue;
    outputEntries[name] = data;
  }

  const modelSettingsBytes = zipEntries[MODEL_SETTINGS_PATH];
  if (modelSettingsBytes) {
    const adapted = adaptModelSettings(utf8Decoder.decode(modelSettingsBytes));
    const recentered = recenterAssembleItems(adapted, response.shifts, warnings);
    outputEntries[MODEL_SETTINGS_PATH] = utf8Encoder.encode(recentered);
  }

  const topModelBytes = zipEntries[TOP_MODEL_PATH];
  if (topModelBytes) {
    const withOrcaTag = addOrcaSlicerMetadata(utf8Decoder.decode(topModelBytes), response.orcaSlicerVersion);
    const recentered = recenterBuildItems(withOrcaTag, response.shifts, warnings);
    outputEntries[TOP_MODEL_PATH] = utf8Encoder.encode(recentered);
  }

  for (const [arcname, config] of Object.entries(response.configFiles)) {
    outputEntries[arcname] = utf8Encoder.encode(JSON.stringify(config, null, 4));
  }

  outputEntries[PROJECT_SETTINGS_PATH] = utf8Encoder.encode(JSON.stringify(response.projectSettings, null, 4));

  return zipSync(outputEntries, { level: 9 });
}
