import type { Vec3 } from "./transform.js";

/**
 * Regex-extract every `<vertex x=".." y=".." z=".."/>` from an XML
 * fragment.
 *
 * Ported from `parse_vertices` in bbs2u1.py (lines 402-406).
 */
export function parseVertices(meshXmlFragment: string): Vec3[] {
  const vertices: Vec3[] = [];
  for (const m of meshXmlFragment.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) {
    vertices.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return vertices;
}
