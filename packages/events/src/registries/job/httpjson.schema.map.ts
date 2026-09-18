import type { JobHttpJsonEventType } from "@lcase/types";
import {
  JobHttpJsonCompletedSchema,
  JobHttpJsonDelayedSchema,
  JobHttpJsonFailedSchema,
  JobHttpJsonQueuedSchema,
  JobHttpJsonResumedSchema,
  JobHttpJsonStartedSchema,
  JobHttpJsonSubmittedSchema,
} from "../../schemas/job/httpjson/httpjson.event.schema.js";
import {
  JobCompletedDataSchema,
  JobFailedDataSchema,
  JobHttpJsonDataSchema,
} from "../../schemas/job/job.data.schema.js";
import type { ZodSchema } from "zod";

export const httpjsonSchemaMap = {
  "job.httpjson.submitted": {
    schema: {
      event: JobHttpJsonSubmittedSchema,
      data: JobHttpJsonDataSchema,
    },
  },
  "job.httpjson.delayed": {
    schema: {
      event: JobHttpJsonDelayedSchema,
      data: JobHttpJsonDataSchema,
    },
  },
  "job.httpjson.resumed": {
    schema: {
      event: JobHttpJsonResumedSchema,
      data: JobHttpJsonDataSchema,
    },
  },
  "job.httpjson.queued": {
    schema: {
      event: JobHttpJsonQueuedSchema,
      data: JobHttpJsonDataSchema,
    },
  },

  "job.httpjson.started": {
    schema: {
      event: JobHttpJsonStartedSchema,
      data: JobHttpJsonDataSchema,
    },
  },
  "job.httpjson.completed": {
    schema: {
      event: JobHttpJsonCompletedSchema,
      data: JobCompletedDataSchema,
    },
  },
  "job.httpjson.failed": {
    schema: {
      event: JobHttpJsonFailedSchema,
      data: JobFailedDataSchema,
    },
  },
} satisfies Record<
  JobHttpJsonEventType,
  { schema: { event: ZodSchema; data: ZodSchema } }
>;
