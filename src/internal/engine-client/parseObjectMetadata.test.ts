import { describe, expect, it } from "vitest";
import { parseObjectMetadata } from "./parseObjectMetadata.js";

describe("parseObjectMetadata", () => {
  it("identifies single objects with names", () => {
    const xml = `
      <model>
        <resources>
          <object id="1" name="Base_Plate" type="model">
            <mesh></mesh>
          </object>
          <object id="2" type="model">
            <metadata name="name">Cylinder_Top</metadata>
            <mesh></mesh>
          </object>
        </resources>
      </model>
    `;
    const meta = parseObjectMetadata(xml);
    expect(meta["1"]).toEqual({ name: "Base_Plate", isAssembly: false });
    expect(meta["2"]).toEqual({ name: "Cylinder_Top", isAssembly: false });
  });

  it("identifies assemblies with components", () => {
    const xml = `
      <model>
        <resources>
          <object id="37" name="Omastar_Assembly" type="model">
            <components>
              <component p:path="/3D/Objects/part1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
              <component p:path="/3D/Objects/part2.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 10 0 0"/>
            </components>
          </object>
        </resources>
      </model>
    `;
    const meta = parseObjectMetadata(xml);
    expect(meta["37"]).toEqual({ name: "Omastar_Assembly", isAssembly: true });
  });

  it("extracts Button as a single object and Assembly with 1-based sequence from Omastar model_settings.config format", () => {
    const modelXml = `
      <model>
        <resources>
          <object id="4" type="model">
            <mesh></mesh>
          </object>
          <object id="24" type="model">
            <components>
              <component p:path="/3D/Objects/sub.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
            </components>
          </object>
        </resources>
      </model>
    `;
    const configXml = `
      <config>
        <object id="4">
          <metadata key="name" value="Button"/>
          <metadata key="extruder" value="1"/>
        </object>
        <object id="24">
          <metadata key="name" value="Assembly"/>
          <metadata key="extruder" value="2"/>
        </object>
        <plate>
          <metadata key="plater_id" value="3"/>
          <model_instance>
            <metadata key="object_id" value="4"/>
            <metadata key="instance_id" value="0"/>
            <metadata key="identify_id" value="924"/>
          </model_instance>
          <model_instance>
            <metadata key="object_id" value="24"/>
            <metadata key="instance_id" value="0"/>
            <metadata key="identify_id" value="1856"/>
          </model_instance>
        </plate>
      </config>
    `;
    const meta = parseObjectMetadata(modelXml, configXml);
    expect(meta["4"]).toEqual({ name: "Button", sequence: 1, isAssembly: false });
    expect(meta["24"]).toEqual({ name: "Assembly", sequence: 2, isAssembly: true });
  });
});
