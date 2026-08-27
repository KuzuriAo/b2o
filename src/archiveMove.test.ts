import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveOriginal } from "./archiveMove.js";

describe("archiveOriginal", () => {
  let tempDir: string;
  let archiveDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "b2o-archive-test-"));
    archiveDir = join(tempDir, "archived");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("moves the file into the archive dir, creating it if needed", () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "content");

    const dest = archiveOriginal(filePath, archiveDir);

    expect(dest).toBe(join(archiveDir, "model.3mf"));
    expect(existsSync(filePath)).toBe(false);
    expect(readFileSync(dest, "utf-8")).toBe("content");
  });

  it("never overwrites an earlier archived file with the same name -- appends a disambiguating suffix", () => {
    writeFileSync(join(tempDir, "one.3mf"), "first");
    writeFileSync(join(tempDir, "two.3mf"), "second");

    const firstDest = archiveOriginal(join(tempDir, "one.3mf"), archiveDir);
    // Rename "two.3mf" to "one.3mf" before archiving it, to simulate two different files
    // that happen to share a name arriving at different times.
    const collidingPath = join(tempDir, "one.3mf");
    writeFileSync(collidingPath, "second");

    const secondDest = archiveOriginal(collidingPath, archiveDir);

    expect(firstDest).toBe(join(archiveDir, "one.3mf"));
    expect(secondDest).toBe(join(archiveDir, "one-1.3mf"));
    expect(readFileSync(firstDest, "utf-8")).toBe("first");
    expect(readFileSync(secondDest, "utf-8")).toBe("second");
  });
});
