/**
 * Extract object names, sequence numbers, and assembly status for each object id from
 * `3D/3dmodel.model` and `Metadata/model_settings.config`.
 */
export interface ObjectMetadata {
  name?: string;
  sequence?: number;
  isAssembly: boolean;
}

export function parseObjectMetadata(
  topModelText: string,
  modelSettingsText?: string,
): Record<string, ObjectMetadata> {
  const result: Record<string, ObjectMetadata> = {};

  // Helper to extract an attribute value regardless of position or quote style
  function getAttr(attrString: string, attrName: string): string | undefined {
    const match = new RegExp(`\\b${attrName}=["']([^"']+)["']`, "i").exec(attrString);
    return match ? match[1].trim() : undefined;
  }

  // 1. Parse top-level <object> blocks from 3D/3dmodel.model
  for (const m of topModelText.matchAll(/<object\s+([^>]*?)>([\s\S]*?)<\/object>/g)) {
    const attrs = m[1];
    const body = m[2];
    const id = getAttr(attrs, "id");
    if (!id) continue;

    // Check if it's an assembly (has <component> children)
    const hasComponents = /<component\s/i.test(body);

    // Check name in attribute: name="..." or <metadata name="name">...</metadata>
    let name = getAttr(attrs, "name");
    if (!name) {
      const metaNameMatch = body.match(/<metadata\s+[^>]*?name="name"[^>]*>([^<]+)<\/metadata>/i);
      if (metaNameMatch) {
        name = metaNameMatch[1].trim();
      }
    }

    result[id] = {
      name,
      isAssembly: hasComponents,
    };
  }

  // 2. Parse Metadata/model_settings.config
  if (modelSettingsText) {
    // Check <object id="..."> blocks containing <metadata key="name" value="..."/>
    for (const m of modelSettingsText.matchAll(/<object\s+([^>]*?)>([\s\S]*?)<\/object>/g)) {
      const attrs = m[1];
      const body = m[2];
      const id = getAttr(attrs, "id");
      if (!id) continue;

      let name = getAttr(attrs, "name");
      if (!name) {
        for (const metaMatch of body.matchAll(/<metadata\s+([^>]*?)\/?>/g)) {
          const metaAttrs = metaMatch[1];
          const key = getAttr(metaAttrs, "key") || getAttr(metaAttrs, "name");
          const val = getAttr(metaAttrs, "value");
          if (key === "name" || key === "object_name") {
            name = val;
            break;
          }
        }
      }

      if (name) {
        if (result[id]) {
          result[id].name = name;
        } else {
          result[id] = { name, isAssembly: false };
        }
      }
    }

    // Check <plate> blocks to assign 1-based sequence order per plate
    const plateBlocks = modelSettingsText.match(/<plate>[\s\S]*?<\/plate>/g) ?? [];
    plateBlocks.forEach((plateBlock) => {
      let seqIndex = 1;
      for (const instMatch of plateBlock.matchAll(/<model_instance>([\s\S]*?)<\/model_instance>/g)) {
        const block = instMatch[1];
        let objectId: string | undefined;
        let instName: string | undefined;

        for (const metaMatch of block.matchAll(/<metadata\s+([^>]*?)\/?>/g)) {
          const metaAttrs = metaMatch[1];
          const key = getAttr(metaAttrs, "key") || getAttr(metaAttrs, "name");
          const val = getAttr(metaAttrs, "value");
          if (!key || !val) continue;

          if (key === "object_id") {
            objectId = val;
          } else if (key === "name" || key === "object_name") {
            instName = val;
          }
        }

        if (objectId) {
          const seq = seqIndex++;
          if (result[objectId]) {
            result[objectId].sequence = seq;
            if (instName && !result[objectId].name) {
              result[objectId].name = instName;
            }
          } else {
            result[objectId] = {
              name: instName,
              sequence: seq,
              isAssembly: false,
            };
          }
        }
      }
    });
  }

  return result;
}
