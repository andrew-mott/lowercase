import type { JobHttpEventType } from "@lcase/types";
import {
  JobHttpCompletedSchema,
  JobHttpFailedSchema,
  JobHttpSubmittedSchema,
} from "../../schemas/job/http/http.event.schema.js";
import {
  JobCompletedDataSchema,
  JobFailedDataSchema,
  JobHttpSubmittedDataSchema,
} from "../../schemas/job/job.data.schema.js";
import type { ZodSchema } from "zod";

export const httpSchemaMap = {
  "job.http.submitted": {
    schema: {
      event: JobHttpSubmittedSchema,
      data: JobHttpSubmittedDataSchema,
    },
  },
  "job.http.completed": {
    schema: {
      event: JobHttpCompletedSchema,
      data: JobCompletedDataSchema,
    },
  },
  "job.http.failed": {
    schema: {
      event: JobHttpFailedSchema,
      data: JobFailedDataSchema,
    },
  },
} satisfies Record<
  JobHttpEventType,
  { schema: { event: ZodSchema; data: ZodSchema } }
>;
