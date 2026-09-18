import type { AnyEvent, ReplayScope } from "@lcase/types";
import { CloudEventContextSchema } from "./cloud-context.schema.js";
import { z } from "zod";
import { ReplayModeSubmittedDataSchema } from "./record.data.schema.js";

export const ReplayScopeSchema = z
  .object({
    runid: z.string(),
    domain: z.literal("replay"),
  })
  .strict() satisfies z.ZodType<ReplayScope>;

export const ReplayModeSubmittedSchema = z
  .object({
    ...CloudEventContextSchema.shape,
    ...ReplayScopeSchema.shape,
    data: ReplayModeSubmittedDataSchema,
    type: z.literal("replay.mode.submitted"),
    entity: z.literal("mode"),
    action: z.literal("submitted"),
  })
  .strict() satisfies z.ZodType<AnyEvent<"replay.mode.submitted">>;
