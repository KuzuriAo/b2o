import { describe, expect, it } from "vitest";
import { addOrcaSlicerMetadata } from "./addOrcaSlicerMetadata.js";

describe("addOrcaSlicerMetadata", () => {
  it("inserts the OrcaSlicer tag right after the Application tag", () => {
    const input = '<model>\n <metadata name="Application">BambuStudio-2.3.5</metadata>\n <metadata name="Copyright"></metadata>\n</model>';
    const result = addOrcaSlicerMetadata(input, "2.4.2");
    expect(result).toBe(
      '<model>\n <metadata name="Application">BambuStudio-2.3.5</metadata>\n <metadata name="OrcaSlicer">2.4.2</metadata>\n <metadata name="Copyright"></metadata>\n</model>',
    );
  });

  it("does not touch the Application tag's own content", () => {
    const input = '<metadata name="Application">BambuStudio-02.07.01.62</metadata>';
    const result = addOrcaSlicerMetadata(input, "2.4.2");
    expect(result).toContain('<metadata name="Application">BambuStudio-02.07.01.62</metadata>');
  });

  it("is idempotent: a no-op if the tag is already present", () => {
    const input = '<metadata name="Application">BambuStudio-2.3.5</metadata>\n <metadata name="OrcaSlicer">2.4.2</metadata>\n';
    expect(addOrcaSlicerMetadata(input, "9.9.9")).toBe(input);
  });

  it("is a no-op when no Application tag is found, rather than throwing", () => {
    const input = "<model><no-application-tag-here/></model>";
    expect(addOrcaSlicerMetadata(input, "2.4.2")).toBe(input);
  });

  it("leaves everything else in the document untouched", () => {
    const input = '<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 5 0"/></build><metadata name="Application">BambuStudio-2.3.5</metadata>';
    const result = addOrcaSlicerMetadata(input, "2.4.2");
    expect(result).toContain('<item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 5 0"/>');
  });
});
