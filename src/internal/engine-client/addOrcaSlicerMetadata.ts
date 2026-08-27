/**
 * Insert a bare `<metadata name="OrcaSlicer">VERSION</metadata>` tag into
 * `3D/3dmodel.model`, right after the existing (inherited-from-Bambu)
 * `<metadata name="Application">` tag -- matching the ordering observed in
 * a genuine OrcaSlicer-saved file.
 *
 * This suppresses Orca-family slicers' "Created by BambuStudio" origin
 * warning. Confirmed empirically (not just inferred from documentation):
 * a Snapmaker-Orca-saved 3MF with only this one tag added opened cleanly
 * in both Snapmaker Orca 2.3.5 and OrcaSlicer 2.4.2, with no warning in
 * either -- see docs/slicer-origin-metadata-brief.md and the follow-up
 * investigation. Rewriting the existing `Application` tag (the brief's
 * original hypothesis) is NOT what real Orca-family saves do -- a
 * genuine Snapmaker Orca save keeps `Application` as `BambuStudio-x.x.x`
 * unchanged and just bumps the trailing version number; a genuine
 * OrcaSlicer save leaves `Application` completely untouched and adds this
 * same separate `OrcaSlicer` tag instead. Adding the tag is the one
 * behavior both real saves have in common, so that's what this ports.
 *
 * Idempotent: a no-op if the tag is already present. Also a no-op
 * (returns the text unchanged) if no `Application` tag is found, rather
 * than throwing -- this is cosmetic metadata, not something that should
 * fail a conversion.
 */
export function addOrcaSlicerMetadata(topModelText: string, version: string): string {
  if (/<metadata name="OrcaSlicer">/.test(topModelText)) {
    return topModelText;
  }
  return topModelText.replace(
    /(<metadata name="Application">[^<]*<\/metadata>\r?\n?)/,
    `$1 <metadata name="OrcaSlicer">${version}</metadata>\n`,
  );
}
