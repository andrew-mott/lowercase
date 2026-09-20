import { z } from "zod";
import type {
  EvalContextSource,
  ExportDeclaration,
  FlowOutputDefinition,
  FlowParamDefinition,
  StepHttpJson,
  StepMcp,
  StepCapCommonFields,
  StepOnField,
  FlowDefinition,
  StepDefinition,
} from "@lcase/types";
import { schemaIssues } from "./ajv/schema-issues.js";
import { validateHttpStep } from "./http.schema.js";
import { StepParallelSchema } from "./parallel.schema.js";
import { StepJoinSchema } from "./join.schema.js";
import { StepBranchSchema } from "./branch.schema.js";
import { ShallowJsonValueSchema } from "./json-value.schema.js";

export const StepOnSchema = z
  .object({
    on: z
      .object({
        success: z.string().optional(),
        failure: z.string().optional(),
      })
      .optional(),
  })
  .strict() satisfies z.ZodType<StepOnField>;

export const StepArgsSchema = z.record(z.string(), z.unknown());
export const StepPipeSchema = z
  .object({
    to: z
      .object({
        step: z.string(),
        payload: z.string(),
      })
      .optional(),
    from: z
      .object({
        step: z.string(),
        buffer: z.number().optional(),
      })
      .optional(),
  })
  .optional();
export const StepCapCommonFieldsSchema = z
  .object({
    args: StepArgsSchema.optional(),
    pipe: StepPipeSchema,
    tool: z.string().optional(),
  })
  .strict() satisfies z.ZodType<StepCapCommonFields>;

export type StepArgs = z.infer<typeof StepArgsSchema>;

export const StepBaseSchema = z
  .object({
    args: StepArgsSchema.optional(),
  })
  .merge(StepOnSchema);
export const StepCapBaseSchema = StepCapCommonFieldsSchema.extend(
  StepOnSchema.shape,
);

export const StepMcpSchema = StepCapBaseSchema.extend({
  type: z.literal("mcp"),
  url: z.string(),
  transport: z.enum(["sse", "stdio", "streamable-http", "http"]),
  feature: z.object({
    primitive: z.enum([
      "resource",
      "prompt",
      "tool",
      "sampling",
      "roots",
      "elicitation",
    ]),
    name: z.string(),
  }),
}).strict() satisfies z.ZodType<StepMcp>;

export const EvalContextSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("param"), name: z.string() }).strict(),
  z
    .object({
      source: z.literal("export"),
      stepId: z.string(),
      name: z.string(),
    })
    .strict(),
  z.object({ source: z.literal("output"), stepId: z.string() }).strict(),
]) satisfies z.ZodType<EvalContextSource>;

export const ExportDeclarationSchema = z
  .object({
    ref: z.string(),
    type: z.enum(["application/json", "text/plain", "text/markdown"]),
    schema: z.record(z.string(), z.unknown()).optional(),
    evalContext: z.record(z.string(), EvalContextSourceSchema).optional(),
  })
  .strict() satisfies z.ZodType<ExportDeclaration>;

export const StepHttpJsonSchema = StepCapBaseSchema.extend({
  type: z.literal("httpjson"),
  url: z.string(),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
    .optional(),

  headers: z.record(z.string(), z.string()).optional(),
  body: ShallowJsonValueSchema.optional(),
  exports: z.record(z.string(), ExportDeclarationSchema).optional(),
}).strict() satisfies z.ZodType<StepHttpJson>;

const ZodStepSchema = z.discriminatedUnion("type", [
  StepHttpJsonSchema,
  StepMcpSchema,
  StepParallelSchema,
  StepJoinSchema,
  StepBranchSchema,
]);

/**
 * Validates one step. An http step is defined by JSON Schema and validated by
 * AJV, whose errors become this parse's issues; every other step goes to the
 * Zod union. The dispatch on `type` is done here rather than by adding a member
 * to the union because a Zod discriminated union only accepts Zod objects: it
 * reads each member's `type` literal from its shape.
 */
export const StepSchema = z
  .custom<StepDefinition>()
  .transform((value: unknown, ctx): StepDefinition => {
    if (isObject(value) && value.type === "http") {
      if (validateHttpStep(value)) return value;
      for (const issue of schemaIssues(validateHttpStep)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, ...issue });
      }
      return z.NEVER;
    }

    const result = ZodStepSchema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) ctx.addIssue(issue);
    return z.NEVER;
  });

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const FlowParamDefinitionSchema = z
  .object({
    // Any MIME string is legal now (see ContentType in @lcase/types) --
    // application/json is the only one anything downstream special-cases, so
    // there's nothing more specific worth validating here.
    type: z.string().min(1),
    optional: z.literal(true).optional(),
  })
  .strict() satisfies z.ZodType<FlowParamDefinition>;

export const FlowOutputSchema = z
  .object({
    payload: z.string(),
  })
  .strict() satisfies z.ZodType<FlowOutputDefinition>;

export const FlowSchema = z
  .object({
    name: z.string().min(1),
    version: z.string(),
    description: z.string().optional(),
    kind: z.enum(["business", "eval"]).optional(),
    params: z.record(z.string(), FlowParamDefinitionSchema).optional(),
    outputs: z.record(z.string(), FlowOutputSchema).optional(),
    start: z.string().min(1),
    steps: z.record(z.string(), StepSchema),
  })
  .strict() satisfies z.ZodType<FlowDefinition>;
