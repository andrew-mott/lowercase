import { z } from "zod";
import type { AnyEvent } from "@lcase/types";
import { CloudEventContextSchema } from "../../cloud-context.schema.js";
import {
  JobCompletedDataSchema,
  JobFailedDataSchema,
  JobMcpDataSchema,
  JobMcpQueuedDataSchema,
  JobMcpSubmittedDataSchema,
} from "../job.data.schema.js";
import { JobScopeSchema } from "../job.event.schema.js";

const EntityCapIdSchema = z.object({
  entity: z.literal("mcp"),
  capid: z.literal("mcp"),
});

export const JobMcpSubmittedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.mcp.submitted"),
    action: z.literal("submitted"),
    data: JobMcpSubmittedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.mcp.submitted">>;

export const JobMcpDelayedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.mcp.delayed"),
    action: z.literal("delayed"),
    data: JobMcpDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.mcp.delayed">>;

export const JobMcpQueuedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.mcp.queued"),
    action: z.literal("queued"),
    data: JobMcpQueuedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.mcp.queued">>;

export const JobMcpStartedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.mcp.started"),
    action: z.literal("started"),
    data: JobMcpDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.mcp.started">>;

export const JobMcpCompletedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.mcp.completed"),
    action: z.literal("completed"),
    data: JobCompletedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.mcp.completed">>;

export const JobMcpFailedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.mcp.failed"),
    action: z.literal("failed"),
    data: JobFailedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.mcp.failed">>;
