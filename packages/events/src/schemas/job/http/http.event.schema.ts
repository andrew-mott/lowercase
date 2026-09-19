import { z } from "zod";
import type { AnyEvent } from "@lcase/types";
import { CloudEventContextSchema } from "../../cloud-context.schema.js";
import {
  JobCompletedDataSchema,
  JobFailedDataSchema,
  JobHttpSubmittedDataSchema,
} from "../job.data.schema.js";
import { JobScopeSchema } from "../job.event.schema.js";

const EntityCapIdSchema = z.object({
  entity: z.literal("http"),
  capid: z.literal("http"),
});

export const JobHttpSubmittedSchema: z.ZodType<AnyEvent<"job.http.submitted">> =
  z
    .object({
      ...CloudEventContextSchema.shape,
      ...JobScopeSchema.shape,
      ...EntityCapIdSchema.shape,
      type: z.literal("job.http.submitted"),
      action: z.literal("submitted"),
      data: JobHttpSubmittedDataSchema,
    })
    .strict();

export const JobHttpCompletedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.http.completed"),
    action: z.literal("completed"),
    data: JobCompletedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.http.completed">>;

export const JobHttpFailedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...JobScopeSchema.shape,
    ...EntityCapIdSchema.shape,
    type: z.literal("job.http.failed"),
    action: z.literal("failed"),
    data: JobFailedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"job.http.failed">>;
