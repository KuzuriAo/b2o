import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { safeUnzipSync } from "./safeUnzip.js";

describe("safeUnzipSync", () => {
  it("unzips a small, ordinary zip normally", () => {
    const zip = zipSync({ "hello.txt": new TextEncoder().encode("hello world") });
    const result = safeUnzipSync(zip);
    expect(new TextDecoder().decode(result["hello.txt"])).toBe("hello world");
  });

  it("allows a large entry with an ordinary compression ratio (a real complex 3MF, not a bomb)", () => {
    // Pseudo-random bytes compress at roughly 1:1 -- far below the 100:1
    // bomb threshold -- while still exercising a >10MB entry, the size at
    // which the ratio check actually kicks in. Mirrors the real regression:
    // a genuine 55-object multi-plate 3MF (563MB uncompressed from a 98MB
    // file, ~5.7:1) was being rejected by a flat absolute-size cap even
    // though its ratio was nowhere near bomb-shaped.
    const bytes = new Uint8Array(11 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const zip = zipSync({ "3D/Objects/object_1.model": bytes });
    const result = safeUnzipSync(zip);
    expect(result["3D/Objects/object_1.model"].length).toBe(bytes.length);
  });

  it("rejects an entry shaped like a decompression bomb (tiny compressed, huge declared uncompressed size)", () => {
    // Highly repetitive data compresses far past the 100:1 threshold --
    // this is the actual signature of a bomb, unlike large absolute size.
    const bytes = new Uint8Array(11 * 1024 * 1024).fill(0);
    const zip = zipSync({ "bomb.bin": bytes }, { level: 9 });
    expect(() => safeUnzipSync(zip)).toThrow(/shaped like a decompression bomb/);
  });

  it("does not ratio-check entries below the 10MB floor, even at extreme ratios", () => {
    const bytes = new Uint8Array(1024).fill(0); // 1KB, tiny -- well under the floor
    const zip = zipSync({ "tiny.bin": bytes }, { level: 9 });
    expect(() => safeUnzipSync(zip)).not.toThrow();
  });

  it("rejects an archive with more entries than the entry-count cap", () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 10_001; i++) {
      entries[`f${i}.txt`] = new Uint8Array(1);
    }
    const zip = zipSync(entries);
    expect(() => safeUnzipSync(zip)).toThrow(/too many entries/);
  });
});
