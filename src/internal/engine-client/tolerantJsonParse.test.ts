import { describe, expect, it } from "vitest";
import { tolerantJsonParse } from "./tolerantJsonParse.js";

describe("tolerantJsonParse", () => {
  it("parses plain valid JSON with no trailing content", () => {
    const result = tolerantJsonParse('{"a": 1, "b": [1, 2, 3]}');
    expect(result.value).toEqual({ a: 1, b: [1, 2, 3] });
    expect(result.trailingText).toBe("");
  });

  it("parses the leading JSON object and reports trailing garbage, matching the real Bambu quirk", () => {
    const result = tolerantJsonParse('{"a": 1}\ncache_hash = a362bca9f19c45e808977c99bb278481e452cef2ebbf3e9\n');
    expect(result.value).toEqual({ a: 1 });
    expect(result.trailingText).toBe("cache_hash = a362bca9f19c45e808977c99bb278481e452cef2ebbf3e9");
  });

  it("does not get confused by braces inside string values", () => {
    const result = tolerantJsonParse('{"key": "value with { curly } and \\" escaped quote"}TRAILING');
    expect(result.value).toEqual({ key: 'value with { curly } and " escaped quote' });
    expect(result.trailingText).toBe("TRAILING");
  });

  it("handles nested objects and arrays correctly", () => {
    const result = tolerantJsonParse('{"nested": {"a": [1, {"b": 2}]}}garbage');
    expect(result.value).toEqual({ nested: { a: [1, { b: 2 }] } });
    expect(result.trailingText).toBe("garbage");
  });

  it("parses a top-level array", () => {
    const result = tolerantJsonParse("[1, 2, 3]extra");
    expect(result.value).toEqual([1, 2, 3]);
    expect(result.trailingText).toBe("extra");
  });

  it("throws for empty input", () => {
    expect(() => tolerantJsonParse("")).toThrow();
  });
});
