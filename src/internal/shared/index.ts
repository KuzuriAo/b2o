/**
 * shared: the /v1/convert request/response contract, as one zod schema
 * used on both sides — the Worker validates incoming requests against it,
 * the frontend gets its request/response TypeScript types from the same
 * inferred type. Contract is fixed by docs/bambu2orca-webapp-architecture.md's
 * "Confirmed v1 flow and API contract" section; the only addition here is
 * the optional `profileId` field (see twinkly-napping-gadget.md's D1
 * schema section) for future multi-printer support.
 */

import { z } from "zod";

/** A single top-level object's plate assignment and computed bounding box. */
export const ConvertObjectSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  sequence: z.number().int().optional(),
  isAssembly: z.boolean().optional(),
  /** Omitted for objects with no plate metadata (matches the Python script's `__unassigned_` handling). */
  plate: z.number().int().optional(),
  /** [minX, maxX, minY, maxY], or null when no mesh geometry was found for this object. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  /** The item transform's raw translation, sent only when bbox is null. */
  fallbackXy: z.tuple([z.number(), z.number()]).optional(),
});
export type ConvertObject = z.infer<typeof ConvertObjectSchema>;

/** A parsed Metadata/project_settings.config JSON blob — deliberately untyped-by-key (hundreds of slicer settings). */
export const ProjectSettingsSchema = z.record(z.string(), z.unknown());
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ConvertRequestSchema = z.object({
  projectSettings: ProjectSettingsSchema,
  objects: z.array(ConvertObjectSchema),
  /** Defaults to 'snapmaker-u1-0.4-standard' server-side if omitted. See D1 schema section 2 of the implementation plan. */
  profileId: z.string().optional(),
  /**
   * The client's cached Ko-fi supporter email, if any -- checked against
   * D1's `supporters` table for a non-expired row to unlock the higher
   * daily quota. No verification beyond that lookup (no login, no proof
   * of ownership) -- a shared/leaked email just bounds itself to that
   * supporter's own quota, which is an acceptable bar for a small
   * donation-supported tool. Absent, malformed, or not currently a
   * supporter all fall back to the free tier, never a hard error.
   */
  supporterEmail: z.string().email().optional(),
  /**
   * Relabels each filament's identity (name/filament_settings_id) to a
   * real Generic or Snapmaker-brand preset instead of the source Bambu
   * filament's own name -- e.g. for marketplace rules (Snapmaker Space,
   * space.snapmaker.com, Snapmaker's own model platform) that require an
   * upload to declare Generic or Snapmaker filament rather than a
   * third-party brand. Identity only:
   * never touches the actual tuned temps/retraction/flow values, so print
   * quality is unaffected. Omitted (the default) leaves filament identity
   * exactly as the source Bambu project had it.
   */
  filamentComplianceMode: z.enum(["generic", "snapmaker"]).optional(),
  /**
   * Opaque partner-site identifier for the handoff-import flow (see
   * docs/partner-handoff-integration-guide.md) -- lets the site owner see
   * which creator sites are actually driving conversions. Purely a
   * "who sent this session" tag, unrelated to the file/mesh itself, so it
   * doesn't touch the Zero-Upload Guarantee. Restricted to a short
   * slug-shaped string (no free text) since it flows straight into
   * analytics without further sanitization.
   */
  referrer: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});
export type ConvertRequest = z.infer<typeof ConvertRequestSchema>;

/** Other Metadata/*.config files to write verbatim into the output 3MF, keyed by archive path. */
export const ConfigFilesSchema = z.record(z.string(), z.record(z.string(), z.unknown()));
export type ConfigFiles = z.infer<typeof ConfigFilesSchema>;

/** objectId -> [dx, dy] shift to apply to that object's transform. */
export const ShiftsSchema = z.record(z.string(), z.tuple([z.number(), z.number()]));
export type Shifts = z.infer<typeof ShiftsSchema>;

export const ConvertResponseSchema = z.object({
  projectSettings: ProjectSettingsSchema,
  configFiles: ConfigFilesSchema,
  shifts: ShiftsSchema,
  /**
   * Written into a bare <metadata name="OrcaSlicer"> tag in 3D/3dmodel.model
   * (see engine-client's addOrcaSlicerMetadata) so Orca-family slicers don't
   * show a "Created by BambuStudio" origin warning -- confirmed empirically
   * against real Snapmaker Orca 2.3.5 and OrcaSlicer 2.4.2 installs, not
   * just inferred from documentation. Sourced from D1's slicer_versions
   * table, refreshed weekly from GitHub releases (see
   * apps/worker/src/services/slicerVersionSync.ts) rather than hardcoded,
   * so it doesn't go stale as new slicer versions ship.
   */
  orcaSlicerVersion: z.string(),
  /**
   * Which profile was actually used and whether it was an exact
   * layer-height match for the detected nozzle diameter, or the nearest
   * available one -- lets the frontend offer a "not quite a match, pick a
   * different tier?" affordance (via GET /v1/profiles) only when needed.
   * Always present when profileId wasn't passed explicitly in the
   * request -- including when no reasonable match could be found at all
   * (see `matchSource: "default-fallback"` below) -- so that case is
   * never silent. Omitted only when profileId was passed explicitly (no
   * detection/matching happened).
   */
  profileMatch: z
    .object({
      profileId: z.string(),
      nozzleDiameter: z.string(),
      exact: z.boolean(),
      /**
       * True when the pick came from matching the Bambu source's own tier
       * name (parsed from its print_settings_id, e.g. "Extra Fine") rather
       * than nearest-layer-height fallback -- a name match is definitive,
       * not a guess, even when `exact` would otherwise read as ambiguous.
       */
      matchedByTierName: z.boolean(),
      /**
       * "auto-tier-name"/"auto-exact" are confident matches; "auto-nearest"
       * is the closest available layer height, not an exact one;
       * "default-fallback" means no diameter could even be detected, or a
       * detected diameter had no layer-height/tier-name match among its
       * candidates at all -- `profileId` above is then just the server's
       * default profile, not a real match, and callers should surface
       * that distinction rather than presenting it as a normal pick.
       */
      matchSource: z.enum(["auto-tier-name", "auto-exact", "auto-nearest", "default-fallback"]),
    })
    .optional(),
  /**
   * Materials that fell back to a Generic preset because
   * `filamentComplianceMode: "snapmaker"` was requested but Snapmaker
   * doesn't ship a branded preset for that material (e.g. "PC", "PVA") --
   * e.g. `["PC"]`. Deduped, in first-seen slot order. Omitted entirely
   * when `filamentComplianceMode` wasn't requested, or when every
   * material present had a real Snapmaker preset.
   */
  filamentComplianceFallback: z.array(z.string()).optional(),
  /**
   * Human-readable notes from the conversion pipeline, most notably from
   * computeShifts' centering pass -- e.g. flagging when a plate's combined
   * footprint is larger than the target printer's bed (translation alone
   * can't make an oversized layout fit; some objects will sit outside the
   * printable area). Previously computed internally and silently
   * discarded rather than surfaced -- see the recentering-bed-fit brief.
   * Omitted entirely when there's nothing worth telling the user.
   */
  warnings: z.array(z.string()).optional(),
});
export type ConvertResponse = z.infer<typeof ConvertResponseSchema>;

/** One entry in GET /v1/profiles -- enough to render a profile picker. */
export const ProfileSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  printerId: z.string(),
  nozzleDiameter: z.string(),
  layerHeight: z.number(),
  /**
   * False for a tier that shares its layer height with another tier at
   * the same diameter (e.g. "0.20 Strength" vs "0.20 Standard" @0.4mm) --
   * /v1/convert's auto-selection never picks these since nothing in a
   * Bambu source file signals which one the user wants. Still listed here
   * for manual selection.
   */
  autoSelectable: z.boolean(),
  /**
   * The tier's own name, e.g. "Extra Fine" or "Standard" -- parsed from
   * displayName. /v1/convert prefers matching this against the tier name
   * parsed out of the Bambu source's own print_settings_id (e.g. "Extra
   * Fine" from "0.08mm Extra Fine @BBL X1C") over the autoSelectable
   * fallback, since the source file's own naming is a stronger signal
   * than a fixed tie-break.
   */
  tierName: z.string(),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfileListResponseSchema = z.object({
  profiles: z.array(ProfileSummarySchema),
});
export type ProfileListResponse = z.infer<typeof ProfileListResponseSchema>;

/**
 * GET /v1/supporter-status?email=... -- whether that email currently has
 * a non-expired Ko-fi supporter row, and their actual daily conversion
 * quota. `dailyLimit` is dynamic (parsed from whichever Membership Tier
 * the supporter is on, see docs/kofi-per-project-dynamic-tiers-brief.md)
 * -- null whenever isSupporter is false, a real number otherwise.
 */
export const SupporterStatusResponseSchema = z.object({
  isSupporter: z.boolean(),
  dailyLimit: z.number().nullable(),
});
export type SupporterStatusResponse = z.infer<typeof SupporterStatusResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** POST /v1/api-keys/request body -- the only input to the magic-link flow. Normalized server-side before any lookup/storage; this is the as-submitted address. */
export const ApiKeyRequestSchema = z.object({
  email: z.string().email(),
});
export type ApiKeyRequest = z.infer<typeof ApiKeyRequestSchema>;
