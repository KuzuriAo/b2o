import type { JsonRecord } from "./types.js";

/** Nozzle diameters we carry a Snapmaker U1 profile for, smallest first. */
export const SUPPORTED_NOZZLE_DIAMETERS = ["0.2", "0.4", "0.6", "0.8"] as const;
export type SupportedNozzleDiameter = (typeof SUPPORTED_NOZZLE_DIAMETERS)[number];

/**
 * Reads the Bambu source's own `nozzle_diameter` (blocklisted from the
 * merge itself, but still present in the raw uploaded project settings)
 * and snaps it to the nearest U1 nozzle size we carry a profile for.
 *
 * Bambu stores this as a per-extruder array (e.g. `["0.4","0.4","0.4","0.4"]`)
 * but a bare scalar is accepted too. Returns `null` when the value is
 * missing or unparseable so the caller can fall back to the default
 * profile rather than guess.
 */
export function detectNozzleDiameter(projectSettings: JsonRecord): SupportedNozzleDiameter | null {
  const raw = projectSettings.nozzle_diameter;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = typeof first === "string" ? Number.parseFloat(first) : typeof first === "number" ? first : NaN;
  if (!Number.isFinite(value)) return null;

  let closest: SupportedNozzleDiameter = SUPPORTED_NOZZLE_DIAMETERS[0];
  let closestDistance = Math.abs(value - Number.parseFloat(closest));
  for (const candidate of SUPPORTED_NOZZLE_DIAMETERS) {
    const distance = Math.abs(value - Number.parseFloat(candidate));
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}
