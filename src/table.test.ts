import { describe, expect, it } from "vitest";
import { formatTable } from "./table.js";

describe("formatTable", () => {
  it("returns an empty string for no rows", () => {
    expect(formatTable([])).toBe("");
  });

  it("left-justifies every column except the last to the widest value in that column", () => {
    const table = formatTable([
      ["a", "bbbb", "c"],
      ["aaaa", "b", "cc"],
    ]);
    const lines = table.split("\n");
    // Column 0 padded to width 4 ("aaaa"), column 1 padded to width 4 ("bbbb"),
    // column 2 (last) left as-is -- with the default 2-space gap.
    expect(lines[0]).toBe("a     bbbb  c");
    expect(lines[1]).toBe("aaaa  b     cc");
  });

  it("does not pad the last column, avoiding pointless trailing whitespace", () => {
    const table = formatTable([
      ["x", "short"],
      ["x", "a much longer value"],
    ]);
    const lines = table.split("\n");
    expect(lines[0]).toBe("x  short");
    expect(lines[0].endsWith(" ")).toBe(false);
  });

  it("respects a custom column gap", () => {
    const table = formatTable([["a", "b"]], 4);
    expect(table).toBe("a    b");
  });

  it("handles a single row / single column without error", () => {
    expect(formatTable([["only"]])).toBe("only");
  });
});
