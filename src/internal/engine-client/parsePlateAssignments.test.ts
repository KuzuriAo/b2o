import { describe, expect, it } from "vitest";
import { parsePlateAssignments } from "./parsePlateAssignments.js";

describe("parsePlateAssignments", () => {
  it("maps each object id to its 1-based plate index", () => {
    const xml = `
      <plate>
        <model_instance>
          <metadata key="object_id" value="3"/>
        </model_instance>
        <model_instance>
          <metadata key="object_id" value="7"/>
        </model_instance>
      </plate>
      <plate>
        <model_instance>
          <metadata key="object_id" value="12"/>
        </model_instance>
      </plate>
    `;
    expect(parsePlateAssignments(xml)).toEqual({ "3": 1, "7": 1, "12": 2 });
  });

  it("returns an empty object when there are no plates", () => {
    expect(parsePlateAssignments("<no-plates/>")).toEqual({});
  });
});
