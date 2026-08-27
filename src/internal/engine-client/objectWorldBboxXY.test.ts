import { describe, expect, it } from "vitest";
import { objectWorldBboxXY } from "./objectWorldBboxXY.js";

const utf8 = new TextEncoder();

describe("objectWorldBboxXY", () => {
  it("computes a world-space bbox from a direct mesh (no external components)", () => {
    const topModelText = `
      <resources>
        <object id="5" type="model">
          <mesh><vertices>
            <vertex x="0" y="0" z="0"/>
            <vertex x="10" y="0" z="0"/>
            <vertex x="10" y="10" z="0"/>
            <vertex x="0" y="10" z="0"/>
          </vertices></mesh>
        </object>
      </resources>
      <build>
        <item objectid="5" transform="1 0 0 0 1 0 0 0 1 100 200 0" />
      </build>
    `;
    const bbox = objectWorldBboxXY("5", topModelText, new Map(), {});
    expect(bbox).toEqual([100, 110, 200, 210]);
  });

  it("composes the item transform with a component's own transform, reading mesh from the zip", () => {
    const topModelText = `
      <object id="7" type="model">
        <components>
          <component p:path="/3D/Objects/part1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
        </components>
      </object>
      <item objectid="7" transform="1 0 0 0 1 0 0 0 1 50 50 0" />
    `;
    const partXml = `
      <resources>
        <object id="1" type="model">
          <mesh><vertices>
            <vertex x="0" y="0" z="0"/>
            <vertex x="5" y="5" z="0"/>
          </vertices></mesh>
        </object>
      </resources>
    `;
    const zipEntries = { "3D/Objects/part1.model": utf8.encode(partXml) };
    const bbox = objectWorldBboxXY("7", topModelText, new Map(), zipEntries);
    expect(bbox).toEqual([50, 55, 50, 55]);
  });

  it("resolves a component with no p:path against an <object> defined in the same model file", () => {
    // Real shape from Bambu/Umbrella+Corp+Pokeball+V2.3mf: intra-model
    // components (assembled from sub-objects in the same 3dmodel.model,
    // not split across separate part files) never carry p:path.
    const topModelText = `
      <resources>
        <object id="2" type="model">
          <components>
            <component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
          </components>
        </object>
        <object id="1" type="model">
          <mesh><vertices>
            <vertex x="0" y="0" z="0"/>
            <vertex x="4" y="6" z="0"/>
          </vertices></mesh>
        </object>
      </resources>
      <build>
        <item objectid="2" transform="1 0 0 0 1 0 0 0 1 20 30 0" />
      </build>
    `;
    const bbox = objectWorldBboxXY("2", topModelText, new Map(), {});
    expect(bbox).toEqual([20, 24, 30, 36]);
  });

  it("resolves a mix of external (p:path) and internal (no p:path) components on the same object", () => {
    const topModelText = `
      <object id="2" type="model">
        <components>
          <component p:path="/part.model" objectid="9" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
          <component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
        </components>
      </object>
      <object id="1" type="model">
        <mesh><vertices><vertex x="1" y="1" z="0"/></vertices></mesh>
      </object>
      <item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
    `;
    const partXml = '<object id="9"><mesh><vertices><vertex x="5" y="5" z="0"/></vertices></mesh></object>';
    const zipEntries = { "part.model": utf8.encode(partXml) };
    expect(objectWorldBboxXY("2", topModelText, new Map(), zipEntries)).toEqual([1, 5, 1, 5]);
  });

  it("strips a leading slash from the component path before looking it up in the zip", () => {
    const topModelText = `
      <object id="7" type="model">
        <components>
          <component p:path="/part.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
        </components>
      </object>
      <item objectid="7" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
    `;
    const partXml = '<object id="1"><mesh><vertices><vertex x="1" y="1" z="0"/></vertices></mesh></object>';
    // Stored without the leading slash, as fflate's unzipSync would key it.
    const zipEntries = { "part.model": utf8.encode(partXml) };
    expect(objectWorldBboxXY("7", topModelText, new Map(), zipEntries)).toEqual([1, 1, 1, 1]);
  });

  it("returns null when the object id has no matching <object> or <item>", () => {
    expect(objectWorldBboxXY("999", "<object id=\"1\"></object>", new Map(), {})).toBeNull();
  });

  it("returns null when a direct-mesh object has no vertices at all", () => {
    const topModelText = '<object id="1" type="model"></object><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />';
    expect(objectWorldBboxXY("1", topModelText, new Map(), {})).toBeNull();
  });

  it("caches a decoded part file across calls instead of re-reading it from the zip", () => {
    const topModelText = `
      <object id="7" type="model">
        <components>
          <component p:path="/part.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
        </components>
      </object>
      <item objectid="7" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
    `;
    const partXml = '<object id="1"><mesh><vertices><vertex x="1" y="1" z="0"/></vertices></mesh></object>';
    const zipEntries = { "part.model": utf8.encode(partXml) };
    const cache = new Map<string, string>();

    objectWorldBboxXY("7", topModelText, cache, zipEntries);
    expect(cache.has("part.model")).toBe(true);

    // Second call with an empty zip -- must still succeed, proving it used the cache, not a fresh zip read.
    const bbox = objectWorldBboxXY("7", topModelText, cache, {});
    expect(bbox).toEqual([1, 1, 1, 1]);
  });

  it("caches an empty string for a component path missing from the zip, rather than throwing", () => {
    const topModelText = `
      <object id="7" type="model">
        <components>
          <component p:path="/missing.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
        </components>
      </object>
      <item objectid="7" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
    `;
    const cache = new Map<string, string>();
    expect(objectWorldBboxXY("7", topModelText, cache, {})).toBeNull();
    expect(cache.get("missing.model")).toBe("");
  });

  it("handles large meshes with >100,000 vertices without blowing the call stack (no Maximum call stack size exceeded)", () => {
    let verticesXml = "";
    // Generate 100,000 vertices
    for (let i = 0; i < 100000; i++) {
      verticesXml += `<vertex x="${i}" y="${-i}" z="0"/>\n`;
    }
    const topModelText = `
      <object id="99" type="model">
        <mesh><vertices>
          ${verticesXml}
        </vertices></mesh>
      </object>
      <item objectid="99" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
    `;
    const bbox = objectWorldBboxXY("99", topModelText, new Map(), {});
    expect(bbox).toEqual([0, 99999, -99999, 0]);
  });
});
