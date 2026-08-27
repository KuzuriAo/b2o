import { describe, expect, it } from "vitest";
import { fmtNum } from "./fmtNum.js";

describe("fmtNum", () => {
  it("formats zero as a bare '0', not '0.000000'", () => {
    expect(fmtNum(0)).toBe("0");
  });

  it("collapses negative zero to '0'", () => {
    expect(fmtNum(-0)).toBe("0");
  });

  it("strips trailing zeros from a fractional value", () => {
    expect(fmtNum(120.5)).toBe("120.5");
    expect(fmtNum(-120.5)).toBe("-120.5");
  });

  it("strips the trailing decimal point for a whole number", () => {
    expect(fmtNum(5)).toBe("5");
    expect(fmtNum(-5)).toBe("-5");
    expect(fmtNum(100)).toBe("100");
    expect(fmtNum(1000)).toBe("1000");
  });

  it("does not truncate a value with two decimal digits", () => {
    expect(fmtNum(100.25)).toBe("100.25");
    expect(fmtNum(-0.5)).toBe("-0.5");
  });

  it("preserves a value at exactly 6 decimal places of precision", () => {
    expect(fmtNum(0.000001)).toBe("0.000001");
  });

  it("collapses a small negative value that rounds to -0.000000 at 6dp to '0', not '-0'", () => {
    expect(fmtNum(-0.00000001)).toBe("0");
  });

  it("rounds a tiny positive value below 6dp precision down to '0'", () => {
    expect(fmtNum(0.00000001)).toBe("0");
  });
});
