import { describe, expect, it } from "vitest";
import { adaptModelSettings } from "./adaptModelSettings.js";

describe("adaptModelSettings", () => {
  it("strips the filament_volume_maps line, leaving everything else untouched", () => {
    const input = [
      '<metadata key="plate_id" value="1"/>',
      '<metadata key="filament_volume_maps" value="0,0,0,0"/>',
      '<metadata key="print_sequence" value="by layer"/>',
    ].join("\n");
    const result = adaptModelSettings(input);
    expect(result).not.toContain("filament_volume_maps");
    expect(result).toContain('key="plate_id"');
    expect(result).toContain('key="print_sequence"');
  });

  it("leaves text with no filament_volume_maps line completely unchanged", () => {
    const input = '<metadata key="plate_id" value="1"/>\n<metadata key="other" value="x"/>\n';
    expect(adaptModelSettings(input)).toBe(input);
  });

  it("handles a final line with no trailing newline", () => {
    const input = 'line one\n<metadata key="filament_volume_maps" value="x"/>\nlast line no newline';
    expect(adaptModelSettings(input)).toBe("line one\nlast line no newline");
  });

  it("removes multiple occurrences if present more than once", () => {
    const input =
      '<metadata key="filament_volume_maps" value="a"/>\nkeep\n<metadata key="filament_volume_maps" value="b"/>\n';
    expect(adaptModelSettings(input)).toBe("keep\n");
  });
});
