import branchStepSchema from "./schemas/branch.step.schema.json" with { type: "json" };
import flowDefinitionSchema from "./schemas/flow-definition.schema.json" with { type: "json" };
import flowKindSchema from "./schemas/flow-kind.schema.json" with { type: "json" };
import flowOutputDefinitionSchema from "./schemas/flow-output-definition.schema.json" with { type: "json" };
import flowParamDefinitionSchema from "./schemas/flow-param-definition.schema.json" with { type: "json" };
import httpJsonStepSchema from "./schemas/http-json.step.schema.json" with { type: "json" };
import httpStepSchema from "./schemas/http.step.schema.json" with { type: "json" };
import joinStepSchema from "./schemas/join.step.schema.json" with { type: "json" };
import mcpStepSchema from "./schemas/mcp.step.schema.json" with { type: "json" };
import parallelStepSchema from "./schemas/parallel.step.schema.json" with { type: "json" };
import stepCapCommonFieldsSchema from "./schemas/step-cap-common-fields.schema.json" with { type: "json" };
import stepOnFieldSchema from "./schemas/step-on-field.schema.json" with { type: "json" };

/** An authored JSON Schema document that can be registered by its `$id`. */
export type FlowSchemaDocument = Readonly<{
  $id: string;
  [keyword: string]: unknown;
}>;

/**
 * Every authored document needed to resolve the composed flow schema. Browser
 * tooling receives these original documents under their authored `$id`s.
 */
export const flowSchemaDocuments: readonly FlowSchemaDocument[] = [
  flowKindSchema,
  flowParamDefinitionSchema,
  flowOutputDefinitionSchema,
  branchStepSchema,
  joinStepSchema,
  parallelStepSchema,
  stepCapCommonFieldsSchema,
  stepOnFieldSchema,
  httpJsonStepSchema,
  mcpStepSchema,
  httpStepSchema,
  flowDefinitionSchema,
];

/** The composed root document an editor associates with a flow draft. */
export const flowDefinitionSchemaId = flowDefinitionSchema.$id;
