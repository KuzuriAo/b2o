import { describe, expect, it } from "vitest";
import { parseVertices } from "./parseVertices.js";

describe("parseVertices", () => {
  it("extracts every vertex from a mesh XML fragment", () => {
    const xml = `
      <mesh>
        <vertices>
          <vertex x="1.5" y="2.5" z="3.5"/>
          <vertex x="-1" y="0" z="10.25"/>
        </vertices>
      </mesh>
    `;
    expect(parseVertices(xml)).toEqual([
      [1.5, 2.5, 3.5],
      [-1, 0, 10.25],
    ]);
  });

  it("returns an empty array when there are no vertices", () => {
    expect(parseVertices("<mesh></mesh>")).toEqual([]);
  });

  it("ignores trailing attributes after z", () => {
    const xml = `<vertex x="1" y="2" z="3" extra="ignored"/>`;
    expect(parseVertices(xml)).toEqual([[1, 2, 3]]);
  });

  it("requires x to be the attribute immediately after <vertex (faithful to the Python original's exact regex, not a DOM parse)", () => {
    const xml = `<vertex id="attr-before" x="1" y="2" z="3"/>`;
    expect(parseVertices(xml)).toEqual([]);
  });
});
