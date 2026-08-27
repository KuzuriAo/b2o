import { escapeRegExp } from "./internal/escapeRegExp.js";
import { parseVertices } from "./parseVertices.js";
import { applyTransform, compose, parseMatrix } from "./transform.js";

export type Bbox = [minX: number, maxX: number, minY: number, maxY: number];

const utf8Decoder = new TextDecoder("utf-8");

/**
 * Compute the true world-space X/Y bounding box of a top-level object's
 * placed geometry, composing the item's plate-placement transform with
 * each part's own transform. Needed because objects assembled from
 * rotated multi-color/cut sub-parts (`<component>`) can have a visual
 * center nowhere near their stored item transform's translation -- the
 * only way to know the real center is to transform the actual mesh
 * vertices.
 *
 * Ported from `object_world_bbox_xy` in bbs2u1.py (lines 409-455).
 *
 * @param zipEntries the full decompressed zip contents (e.g. fflate's
 *   `unzipSync` output) -- this function reads component part files by
 *   path directly out of it, same as the Python original's `zf.read()`.
 * @param partFileCache memoizes decoded part-file text across many calls
 *   within one conversion pass (mutated in place by design, matching the
 *   Python original -- a legitimate cross-call memoization cache, not
 *   incidental state).
 * @returns `[minX, maxX, minY, maxY]`, or `null` if nothing could be found.
 */
/** Finds the `<object id="...">...</object>` block for `objectId` in `text`, or null. */
function findObjectBlock(objectId: string, text: string): string | null {
  const match = new RegExp(`<object id="${escapeRegExp(objectId)}"[^>]*>[\\s\\S]*?</object>`).exec(text);
  return match ? match[0] : null;
}

/** Order-independent single-attribute lookup within one `<component .../>` tag. */
function componentAttr(tag: string, name: string): string | null {
  const match = new RegExp(`${escapeRegExp(name)}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

export function objectWorldBboxXY(
  objectId: string,
  topModelText: string,
  partFileCache: Map<string, string>,
  zipEntries: Readonly<Record<string, Uint8Array>>,
): Bbox | null {
  const objBlock = findObjectBlock(objectId, topModelText);
  const itemMatch = new RegExp(`<item objectid="${escapeRegExp(objectId)}"[^>]*transform="([^"]+)"`).exec(topModelText);
  if (!objBlock || !itemMatch) return null;

  const [itemR, itemT] = parseMatrix(itemMatch[1]);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  // Attribute order isn't fixed by the 3MF spec, so each attribute is
  // pulled independently rather than matched positionally. `p:path` is
  // absent for components referencing an <object> defined in this same
  // model file (a legitimate "assembled from local sub-parts" case, not
  // just the "split across separate part files" one) -- when absent,
  // resolve objectid against topModelText itself instead of an external part.
  const componentTags = [...objBlock.matchAll(/<component\b[^>]*\/>/g)].map((m) => m[0]);

  if (componentTags.length > 0) {
    for (const tag of componentTags) {
      const path = componentAttr(tag, "p:path");
      const subObjId = componentAttr(tag, "objectid");
      const transform = componentAttr(tag, "transform");
      if (!subObjId || !transform) continue;

      let subBlock: string | null;
      if (path) {
        const key = path.replace(/^\/+/, "");
        if (!partFileCache.has(key)) {
          const bytes = zipEntries[key];
          partFileCache.set(key, bytes ? utf8Decoder.decode(bytes) : "");
        }
        subBlock = findObjectBlock(subObjId, partFileCache.get(key)!);
      } else {
        subBlock = findObjectBlock(subObjId, topModelText);
      }
      if (!subBlock) continue;

      const verts = parseVertices(subBlock);
      const [compR, compT] = parseMatrix(transform);
      const [R, T] = compose(itemR, itemT, compR, compT);
      for (const v of verts) {
        const [wx, wy] = applyTransform(v, R, T);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        count++;
      }
    }
  } else {
    // Direct mesh in the same object definition (no components at all).
    for (const v of parseVertices(objBlock)) {
      const [wx, wy] = applyTransform(v, itemR, itemT);
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
      count++;
    }
  }

  if (count === 0) return null;
  return [minX, maxX, minY, maxY];
}
