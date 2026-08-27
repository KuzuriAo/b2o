import { describe, expect, it } from "vitest";
import { recenterAssembleItems } from "./recenterAssembleItems.js";

describe("recenterAssembleItems", () => {
  it("shifts an assemble_item carrying instance_id, matched by object_id", () => {
    const xml =
      '<config><assemble>\n  <assemble_item object_id="3" instance_id="1" transform="1 0 0 0 1 0 0 0 1 10 20 30" />\n</assemble></config>';
    const warnings: string[] = [];
    const result = recenterAssembleItems(xml, { "3": [5, -2] }, warnings);

    expect(result).toContain('transform="1 0 0 0 1 0 0 0 1 15 18 30"');
    expect(warnings).toContain("  Recentered 1 assemble_item(s) in model_settings.config.");
  });

  it("leaves an assemble_item with no instance_id untouched and counts it as skipped", () => {
    const xml = '<assemble><assemble_item object_id="1" transform="1 0 0 0 1 0 0 0 1 10 20 30" /></assemble>';
    const warnings: string[] = [];
    const result = recenterAssembleItems(xml, { "1": [5, 5] }, warnings);
    expect(result).toContain('transform="1 0 0 0 1 0 0 0 1 10 20 30"'); // unchanged
    expect(warnings).toContain("  Left 1 assemble_item(s) untouched.");
  });

  it("defaults to a zero shift when object_id has no entry in shifts", () => {
    const xml = '<assemble><assemble_item object_id="99" instance_id="1" transform="1 0 0 0 1 0 0 0 1 10 20 30" /></assemble>';
    const result = recenterAssembleItems(xml, {}, []);
    expect(result).toContain('transform="1 0 0 0 1 0 0 0 1 10 20 30"');
  });

  it("returns the text unchanged when no <assemble> section is found", () => {
    const xml = "<config><no-assemble-here/></config>";
    expect(recenterAssembleItems(xml, { "1": [5, 5] }, [])).toBe(xml);
  });

  it("warns on a malformed (non-12-token) transform and leaves it untouched", () => {
    const xml = '<assemble><assemble_item object_id="1" instance_id="1" transform="1 0 0" /></assemble>';
    const warnings: string[] = [];
    const result = recenterAssembleItems(xml, { "1": [5, 5] }, warnings);
    expect(result).toContain('transform="1 0 0"');
    expect(warnings.some((w) => w.includes("unexpected assemble transform format on object 1"))).toBe(true);
  });
});
