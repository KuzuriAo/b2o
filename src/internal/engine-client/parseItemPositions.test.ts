import { describe, expect, it } from "vitest";
import { parseItemPositions } from "./parseItemPositions.js";

describe("parseItemPositions", () => {
  it("extracts (tx, ty) from each item's 12-token transform", () => {
    const xml = '<item objectid="3" transform="1 0 0 0 1 0 0 0 1 100 200 0" />';
    expect(parseItemPositions(xml)).toEqual({ "3": [100, 200] });
  });

  it("skips an item whose transform doesn't have exactly 12 tokens", () => {
    const xml = '<item objectid="3" transform="1 0 0" />';
    expect(parseItemPositions(xml)).toEqual({});
  });

  it("handles multiple items", () => {
    const xml =
      '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 20 0" />' +
      '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 30 40 0" />';
    expect(parseItemPositions(xml)).toEqual({ "1": [10, 20], "2": [30, 40] });
  });
});
