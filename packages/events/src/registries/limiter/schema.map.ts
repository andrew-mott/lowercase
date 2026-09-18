import type { LimiterEventType } from "@lcase/types";
import type { ZodSchema } from "zod";
import {
  LimiterStartedSchema,
  LimiterStoppedSchema,
  LimiterSlotDeniedSchema,
  LimiterSlotGrantedSchema,
} from "../../schemas/limiter.event.schema.js";
import {
  LimiterStartedDataSchema,
  LimiterSlotDeniedDataSchema,
  LimiterSlotGrantedDataSchema,
} from "../../schemas/limiter.data.schema.js";

type LimiterSchemaMap = Record<
  LimiterEventType,
  { schema: { event: ZodSchema; data: ZodSchema } }
>;
export const limiterSchemaMap: LimiterSchemaMap = {
  "limiter.slot.denied": {
    schema: {
      event: LimiterSlotDeniedSchema,
      data: LimiterSlotDeniedDataSchema,
    },
  },
  "limiter.slot.granted": {
    schema: {
      event: LimiterSlotGrantedSchema,
      data: LimiterSlotGrantedDataSchema,
    },
  },
  "limiter.started": {
    schema: {
      event: LimiterStartedSchema,
      data: LimiterStartedDataSchema,
    },
  },
  "limiter.stopped": {
    schema: {
      event: LimiterStoppedSchema,
      data: LimiterStartedDataSchema,
    },
  },
};
