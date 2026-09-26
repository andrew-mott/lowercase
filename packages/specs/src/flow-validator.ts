import { Ajv2020 } from "ajv/dist/2020.js";
import type { FlowDefinition, StepCapCommonFields } from "@lcase/types";
import { schemaIssues, type SchemaIssue } from "./ajv/validation-issues.js";
import {
  flowDefinitionSchemaId,
  flowSchemaDocuments,
} from "./flow-schema-documents.js";

const ajv = new Ajv2020({ allErrors: true, verbose: true });

// AJV uses local `#/…` paths for errors inside an `allOf`. Indexing every
// schema node lets validation-issues retain errors from the selected step.
const schemaOwners = new WeakMap<object, string>();

// Retains the existing internal name while deriving it from generated types.
export type StepArgs = NonNullable<StepCapCommonFields["args"]>;

for (const schema of flowSchemaDocuments) {
  const id = schema.$id;
  indexSchemaOwner(schema, id);
  ajv.addSchema(schema);
}

/**
 * Validates an entire flow against the composed authored schema. Referenced
 * schemas are registered by their stable `$id` before the flow root compiles.
 */
const flowDefinitionValidator = ajv.getSchema<FlowDefinition>(
  flowDefinitionSchemaId,
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
