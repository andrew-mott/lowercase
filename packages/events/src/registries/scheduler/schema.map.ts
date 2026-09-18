import type { SchedulerEventType } from "@lcase/types";
import type { ZodSchema } from "zod";
import {
  SchedulerStartedSchema,
  SchedulerStoppedSchema,
  SchedulerToolRequestedSchema,
} from "../../schemas/scheduler.event.schema.js";
import {
  SchedulerStartedDataSchema,
  SchedulerStoppedDataSchema,
  SchedulerToolRequestedDataSchema,
} from "../../schemas/scheduler.data.schema.js";

type SchedulerSchemaMap = Record<
  SchedulerEventType,
  { schema: { event: ZodSchema; data: ZodSchema } }
>;
export const schedulerSchemaMap: SchedulerSchemaMap = {
  "scheduler.slot.requested": {
    schema: {
      event: SchedulerToolRequestedSchema,
      data: SchedulerToolRequestedDataSchema,
    },
  },
  "scheduler.started": {
    schema: {
      event: SchedulerStartedSchema,
      data: SchedulerStartedDataSchema,
    },
  },
  "scheduler.stopped": {
    schema: {
      event: SchedulerStoppedSchema,
      data: SchedulerStoppedDataSchema,
    },
  },
};
