import type { ArtifactWriterPort } from "@lcase/ports";
import type { FlowDefinition, JsonValue } from "@lcase/types";
import path from "node:path";
import fs from "node:fs";

export async function addFlowToCas(
  flowDef: FlowDefinition,
  writer: ArtifactWriterPort,
): Promise<string | undefined> {
  try {
    const result = await writer.save(flowDef as JsonValue, "application/json");
    if (result.status === "saved" || result.status === "content-only") {
      return result.hash;
    }
    console.log(`Unable to save flow in CAS: ${result.error.message}`);
  } catch (e) {
    throw new Error(`Error adding file to CAS: ${e}`);
  }
}

export function readFlowFile(absoluteFilePath: string): JsonValue {
  if (
    !path.isAbsolute(absoluteFilePath) ||
    path.extname(absoluteFilePath).length === 0
  ) {
    throw new Error(`Path is not an absolute file path: ${absoluteFilePath}`);
  }

  try {
    const data = fs.readFileSync(absoluteFilePath, { encoding: "utf8" });
    const json = JSON.parse(data) as JsonValue;
    return json;
  } catch (e) {
    throw new Error(`Error adding file to CAS: ${e}`);
  }
}
