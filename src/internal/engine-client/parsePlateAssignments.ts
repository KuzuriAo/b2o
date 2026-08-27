/**
 * Map objectid -> plate index (1-based) from `<plate><model_instance>`
 * metadata in `model_settings.config`.
 *
 * Ported from `parse_plate_assignments` in bbs2u1.py (lines 458-467).
 */
export function parsePlateAssignments(modelSettingsText: string): Record<string, number> {
  const plates = modelSettingsText.match(/<plate>[\s\S]*?<\/plate>/g) ?? [];
  const assignment: Record<string, number> = {};
  plates.forEach((plate, i) => {
    const plateIndex = i + 1;
    for (const m of plate.matchAll(/key="object_id" value="(\d+)"/g)) {
      assignment[m[1]] = plateIndex;
    }
  });
  return assignment;
}
