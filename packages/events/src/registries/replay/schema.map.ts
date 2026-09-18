import type { ReplayEventType } from "@lcase/types";
import type { ZodSchema } from "zod";
import { ReplayModeSubmittedSchema } from "../../schemas/record.event.schema.js";
import { ReplayModeSubmittedDataSchema } from "../../schemas/record.data.schema.js";

export const replaySchemaMap = {
  "replay.mode.submitted": {
    schema: {
      event: ReplayModeSubmittedSchema,
      data: ReplayModeSubmittedDataSchema,
    },
  },
} satisfies Record<
  ReplayEventType,
  {
    schema: { event: ZodSchema; data: ZodSchema };
  }
>;
