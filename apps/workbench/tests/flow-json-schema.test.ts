import { describe, expect, it, vi } from "vitest";
import type * as monacoEditor from "monaco-editor";
import { flowDefinitionSchemaId, flowSchemaDocuments } from "@lcase/specs";
import {
  FLOW_AUTHORING_MODEL_URI,
  configureFlowJsonSchema,
  flowJsonDiagnosticsOptions,
} from "@/lib/flow-json-schema";

describe("flowJsonDiagnosticsOptions", () => {
  it("registers the authored schema graph and applies its root only to the flow draft", () => {
    const options = flowJsonDiagnosticsOptions();

    expect(options).toMatchObject({
      validate: true,
      allowComments: false,
      comments: "error",
      trailingCommas: "error",
      schemaValidation: "error",
      schemaRequest: "error",
      enableSchemaRequest: false,
    });
    expect(options.schemas.map(({ uri }) => uri)).toEqual(
      flowSchemaDocuments.map(({ $id }) => $id),
    );
    expect(
      options.schemas.find(({ uri }) => uri === flowDefinitionSchemaId),
    ).toMatchObject({
      schema: flowSchemaDocuments.find(
        ({ $id }) => $id === flowDefinitionSchemaId,
      ),
      fileMatch: [FLOW_AUTHORING_MODEL_URI],
    });
  });

  it("installs that configuration on Monaco's JSON language service", () => {
    const setDiagnosticsOptions = vi.fn();
    const monaco = {
      json: { jsonDefaults: { setDiagnosticsOptions } },
    };

    configureFlowJsonSchema(monaco as unknown as typeof monacoEditor);

    expect(setDiagnosticsOptions).toHaveBeenCalledWith(
      flowJsonDiagnosticsOptions(),
    );
  });
});
