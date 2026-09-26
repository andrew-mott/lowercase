import { Ajv2020 } from "ajv/dist/2020.js";
import type { FlowDefinition, StepCapCommonFields } from "@lcase/types";
import { schemaIssues, type SchemaIssue } from "./ajv/validation-issues.js";
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

const ajv = new Ajv2020({ allErrors: true, verbose: true });
const schemas = [
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
] as object[];

// AJV uses local `#/…` paths for errors inside an `allOf`. Indexing every
// schema node lets validation-issues retain errors from the selected step.
const schemaOwners = new WeakMap<object, string>();

// Retains the existing internal name while deriving it from generated types.
export type StepArgs = NonNullable<StepCapCommonFields["args"]>;

for (const schema of schemas) {
  const id = (schema as { $id: string }).$id;
  indexSchemaOwner(schema, id);
  ajv.addSchema(schema);
}

/**
 * Validates an entire flow against the composed authored schema. Referenced
 * schemas are registered by their stable `$id` before the flow root compiles.
 */
const flowDefinitionValidator = ajv.getSchema<FlowDefinition>(
  "flow-definition.schema.json",
)!;

export function validateFlowDefinition(
  value: unknown,
): value is FlowDefinition {
  // getSchema also permits async validators; these registered schemas are synchronous.
  // synchronous validators always return true or false, so casting here because
  // TypeScript cannot narrow to that on its own
  return flowDefinitionValidator(value) as boolean;
}

/**
 * Returns readable issues from the most recent failed flow validation. AJV
 * owns validity; this only adapts its diagnostics for existing callers.
 */
export function flowValidationIssues(): SchemaIssue[] {
  return schemaIssues(
    flowDefinitionValidator,
    (id) => ajv.getSchema(id)?.schema,
    (schema) =>
      typeof schema === "object" && schema !== null
        ? schemaOwners.get(schema)
        : undefined,
  );
}

function indexSchemaOwner(schema: object, id: string) {
  schemaOwners.set(schema, id);
  for (const child of Object.values(schema)) {
    if (typeof child === "object" && child !== null) {
      indexSchemaOwner(child, id);
    }
  }
}
