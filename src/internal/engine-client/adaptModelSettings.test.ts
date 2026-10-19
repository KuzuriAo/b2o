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

  // Snorca 2.4.0 refuses a file whose per-object overrides carry a `nil`
  // ("Deserializing nil into a non-nullable object"). Seen in N3D's Doduo.
  describe("per-variant nil lists (e.g. dual-nozzle H2D overrides)", () => {
    it("keeps the first value of an object override like 50,nil", () => {
      const input = '   <metadata key="inner_wall_speed" value="50,nil"/>\n   <metadata key="top_surface_speed" value="50,nil"/>\n';
      expect(adaptModelSettings(input)).toBe('   <metadata key="inner_wall_speed" value="50"/>\n   <metadata key="top_surface_speed" value="50"/>\n');
    });

    it("keeps a percentage or decimal first value", () => {
      expect(adaptModelSettings('<metadata key="sparse_infill_speed" value="40%,nil"/>\n')).toBe('<metadata key="sparse_infill_speed" value="40%"/>\n');
      expect(adaptModelSettings('<metadata key="x" value="0.2,nil,nil"/>')).toBe('<metadata key="x" value="0.2"/>');
    });

    it("drops the line when the first value is itself nil (no override)", () => {
      const input = 'before\n   <metadata key="inner_wall_speed" value="nil,60"/>\n   <metadata key="a" value="nil"/>\nafter\n';
      expect(adaptModelSettings(input)).toBe("before\nafter\n");
    });

    it("leaves lists without a nil, and free text that merely contains one, alone", () => {
      const lists = '<metadata key="x" value="50,60"/>\n<metadata key="name" value="Gear, nil edition"/>\n<metadata key="name" value="nil,thing"/>\n';
      expect(adaptModelSettings(lists)).toBe(lists);
    });

    it("preserves CRLF line endings on a collapsed line", () => {
      expect(adaptModelSettings('<metadata key="x" value="50,nil"/>\r\nkeep\r\n')).toBe('<metadata key="x" value="50"/>\r\nkeep\r\n');
    });
  });
});
