import { z } from "zod";
import { CloudEventContextSchema } from "./cloud-context.schema.js";
import type { RunScope, AnyEvent } from "@lcase/types";
import {
  RunCompletedDataSchema,
  RunDeniedDataSchema,
  RunFailedDataSchema,
  RunRequestedDataSchema,
  RunStartedDataSchema,
} from "./run.data.schema.js";

export const RunContextSchema = z
  .object({
    flowid: z.string(),
    flowversionid: z.string(),
    runid: z.string(),
    domain: z.literal("run"),
  })
  .strict() satisfies z.ZodType<RunScope>;

export const RunRequestedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...RunContextSchema.shape,
    type: z.literal("run.requested"),
    entity: z.undefined().optional(),
    action: z.literal("requested"),
    data: RunRequestedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"run.requested">>;

export const RunStartedSchema = CloudEventContextSchema.merge(RunContextSchema)
  .merge(
    z.object({
      type: z.literal("run.started"),
      entity: z.undefined().optional(),
      action: z.literal("started"),
      data: RunStartedDataSchema,
    }),
  )
  .strict() satisfies z.ZodType<AnyEvent<"run.started">>;

export const RunCompletedSchema = CloudEventContextSchema.merge(
  RunContextSchema,
)
  .merge(
    z.object({
      type: z.literal("run.completed"),
      entity: z.undefined().optional(),
      action: z.literal("completed"),
      data: RunCompletedDataSchema,
    }),
  )
  .strict() satisfies z.ZodType<AnyEvent<"run.completed">>;

export const RunFailedSchema = CloudEventContextSchema.merge(RunContextSchema)
  .merge(
    z.object({
      type: z.literal("run.failed"),
      entity: z.undefined().optional(),
      action: z.literal("failed"),
      data: RunFailedDataSchema,
    }),
  )
  .strict() satisfies z.ZodType<AnyEvent<"run.failed">>;

export const RunDeniedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...RunContextSchema.shape,
    type: z.literal("run.denied"),
    entity: z.undefined().optional(),
    action: z.literal("denied"),
    data: RunDeniedDataSchema,
  })
  .strict() satisfies z.ZodType<AnyEvent<"run.denied">>;
