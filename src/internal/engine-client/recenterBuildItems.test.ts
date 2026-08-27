import { describe, expect, it } from "vitest";
import { recenterBuildItems } from "./recenterBuildItems.js";

describe("recenterBuildItems", () => {
  it("shifts an item's translation by the given dx/dy, preserving other attributes byte-for-byte", () => {
    const xml =
      '<model><build>\n  <item objectid="3" p:printable="1" transform="1 0 0 0 1 0 0 0 1 10 20 30" />\n</build></model>';
    const warnings: string[] = [];
    const result = recenterBuildItems(xml, { "3": [5, -2] }, warnings);

    expect(result).toContain('transform="1 0 0 0 1 0 0 0 1 15 18 30"');
    expect(result).toContain('p:printable="1"'); // untouched attribute preserved exactly
    expect(warnings).toEqual(["  Recentered 1 object placement(s) in 3D/3dmodel.model."]);
  });

  it("defaults to a zero shift for an object id not present in shifts", () => {
    const xml = '<build><item objectid="99" transform="1 0 0 0 1 0 0 0 1 10 20 30" /></build>';
    const result = recenterBuildItems(xml, {}, []);
    expect(result).toContain('transform="1 0 0 0 1 0 0 0 1 10 20 30"');
  });

  it("leaves content outside <build>...</build> untouched", () => {
    const xml =
      '<header><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" /></header><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0" /></build>';
    const result = recenterBuildItems(xml, { "1": [100, 100], "2": [5, 5] }, []);
    expect(result).toContain('objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"'); // untouched: outside <build>
    expect(result).toContain('objectid="2" transform="1 0 0 0 1 0 0 0 1 5 5 0"'); // shifted: inside <build>
  });

  it("returns the text unchanged when no <build> section is found", () => {
    const xml = "<model><no-build-here/></model>";
    expect(recenterBuildItems(xml, { "1": [5, 5] }, [])).toBe(xml);
  });

  it("warns and leaves the tag untouched for a malformed (non-12-token) transform", () => {
    const xml = '<build><item objectid="1" transform="1 0 0" /></build>';
    const warnings: string[] = [];
    const result = recenterBuildItems(xml, { "1": [5, 5] }, warnings);
    expect(result).toContain('transform="1 0 0"');
    expect(warnings.some((w) => w.includes("unexpected transform format on object 1"))).toBe(true);
  });

  it("shifts multiple items independently by their own object id's shift", () => {
    const xml =
      '<build>' +
      '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />' +
      '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0" />' +
      "</build>";
    const result = recenterBuildItems(xml, { "1": [10, 0], "2": [0, 20] }, []);
    expect(result).toContain('objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"');
    expect(result).toContain('objectid="2" transform="1 0 0 0 1 0 0 0 1 0 20 0"');
  });
});
