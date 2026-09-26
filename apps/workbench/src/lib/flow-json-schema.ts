import type * as monacoEditor from "monaco-editor";
import { flowDefinitionSchemaId, flowSchemaDocuments } from "@lcase/specs";

/** The internal Monaco model identity for the unsaved flow-authoring draft. */
export const FLOW_AUTHORING_MODEL_URI = "inmemory://lcase/flows/new-flow.json";

// Monaco owns JSON diagnostics globally. Reapplying this stable, complete
// registration is idempotent; later JSON integrations extend this one helper.
export function flowJsonDiagnosticsOptions() {
  return {
    validate: true,
    allowComments: false,
    comments: "error" as const,
    trailingCommas: "error" as const,
    schemaValidation: "error" as const,
    schemaRequest: "error" as const,
    enableSchemaRequest: false,
    schemas: flowSchemaDocuments.map((schema) => ({
      uri: schema.$id,
      schema,
      ...(schema.$id === flowDefinitionSchemaId
        ? { fileMatch: [FLOW_AUTHORING_MODEL_URI] }
        : {}),
    })),
  };
}

/** Register the authored flow-schema graph before the flow model is created. */
export function configureFlowJsonSchema(monaco: typeof monacoEditor) {
  monaco.json.jsonDefaults.setDiagnosticsOptions(flowJsonDiagnosticsOptions());
}
