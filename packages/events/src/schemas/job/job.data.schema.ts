import { z } from "zod";
import { ShallowJsonValueSchema } from "../shallow-json-value.schema.js";
import type {
  ExportRef,
  JobCompletedData,
  JobDelayedData,
  JobFailedData,
  JobHttpData,
  JobHttpJsonData,
  JobHttpSubmittedData,
  JobStartedData,
  CapId,
  JobMcpData,
  JobHttpJsonSubmittedData,
  JobMcpSubmittedData,
  Ref,
} from "@lcase/types";

export const CapIdSchema = z.enum([
  "mcp",
  "httpjson",
  "http",
]) satisfies z.ZodType<CapId>;

export const RefSchema = z
  .object({
    valuePath: z.array(z.union([z.string(), z.number()])),
    bindPath: z.array(z.union([z.string(), z.number()])),
    interpolated: z.boolean(),
    string: z.string(),
    stepId: z.string(),
    hash: z.union([z.string(), z.null()]),
    scope: z.enum(["steps", "input", "env", "params"]),
    json: z.literal(true).optional(),
    // Any MIME type, not the closed three-literal set: matches ContentType,
    // widened by voice-pipeline Change C2. exportType stays closed below --
    // an export is always JSON-derived, so it can never legally be binary.
    paramType: z.string().min(1).optional(),
    exportType: z
      .enum(["application/json", "text/plain", "text/markdown"])
      .optional(),
  })
  .strict() satisfies z.ZodType<Ref>;

export const ExportRefSchema = z
  .object({
    exportName: z.string(),
    valuePath: z.array(z.union([z.string(), z.number()])),
    scope: z.literal("output"),
    string: z.string(),
    type: z.enum(["application/json", "text/plain", "text/markdown"]),
    schema: z.record(z.string(), z.unknown()).optional(),
  })
  .strict() satisfies z.ZodType<ExportRef>;

/* Mcp */

export const JobMcpDataSchema = z
  .object({
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
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict() satisfies z.ZodType<JobMcpData>;

export const JobMcpSubmittedDataSchema = z
  .object({
    ...JobMcpDataSchema.shape,
    refs: z.array(RefSchema),
  })
  .strict() satisfies z.ZodType<JobMcpSubmittedData>;

export const JobMcpQueuedDataSchema = JobMcpSubmittedDataSchema;

/* HttpJson */

export const JobHttpJsonDataSchema = z
  .object({
    url: z.string(),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
      .optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: ShallowJsonValueSchema.optional(),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict() satisfies z.ZodType<Omit<JobHttpJsonData, "type">>;

export const JobHttpJsonSubmittedDataSchema = z
  .object({
    ...JobHttpJsonDataSchema.shape,
    refs: z.array(RefSchema),
    exportRefs: z.record(z.string(), ExportRefSchema).optional(),
  })
  .strict() satisfies z.ZodType<JobHttpJsonSubmittedData>;

export const JobHttpJsonQueuedDataSchema = JobHttpJsonSubmittedDataSchema;

/* Http */

const HttpBodyJsonSchema = z.object({ json: ShallowJsonValueSchema }).strict();
const HttpBodyArtifactSchema = z.object({ artifact: z.string() }).strict();
const HttpMultipartFileSchema = z
  .object({ artifact: z.string(), filename: z.string().optional() })
  .strict();
const HttpBodyMultipartSchema = z
  .object({
    multipart: z.record(
      z.string(),
      z.union([z.string(), HttpMultipartFileSchema]),
    ),
  })
  .strict();

export const JobHttpDataSchema = z
  .object({
    url: z.string(),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
      .optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z
      .union([
        HttpBodyJsonSchema,
        HttpBodyArtifactSchema,
        HttpBodyMultipartSchema,
      ])
      .optional(),
  })
  .strict() satisfies z.ZodType<JobHttpData>;

export const JobHttpSubmittedDataSchema = z
  .object({
    ...JobHttpDataSchema.shape,
    refs: z.array(RefSchema),
    exportRefs: z.record(z.string(), ExportRefSchema).optional(),
  })
  .strict() satisfies z.ZodType<JobHttpSubmittedData>;

export const JobDelayedDataSchema = z.object({
  reason: z.string(),
}) satisfies z.ZodType<JobDelayedData>;

export const JobStartedDataSchema = z
  .object({
    status: z.literal("started"),
  })
  .strict() satisfies z.ZodType<JobStartedData>;

export const JobCompletedDataSchema = z
  .object({
    status: z.literal("success"),
    output: z.string().nullable(),
    exportHashes: z.record(z.string(), z.string()).optional(),
    message: z.string().optional(),
  })
  .strict() satisfies z.ZodType<JobCompletedData>;

export const JobFailedDataSchema = z
  .object({
    status: z.literal("failure"),
    output: z.string().nullable(),
    exportHashes: z.record(z.string(), z.string()).optional(),
    message: z.string().optional(),
  })
  .strict() satisfies z.ZodType<JobFailedData>;
