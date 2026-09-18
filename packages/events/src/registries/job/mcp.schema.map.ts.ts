import type { JobMcpEventType } from "@lcase/types";
import {
  JobMcpCompletedSchema,
  JobMcpDelayedSchema,
  JobMcpFailedSchema,
  JobMcpQueuedSchema,
  JobMcpStartedSchema,
  JobMcpSubmittedSchema,
} from "../../schemas/job/mcp/mcp.event.schema.js";
import {
  JobCompletedDataSchema,
  JobFailedDataSchema,
  JobMcpDataSchema,
} from "../../schemas/job/job.data.schema.js";
import type { ZodSchema } from "zod";

export const mcpSchemaMap = {
  "job.mcp.submitted": {
    schema: {
      event: JobMcpSubmittedSchema,
      data: JobMcpDataSchema,
    },
  },
  "job.mcp.delayed": {
    schema: {
      event: JobMcpDelayedSchema,
      data: JobMcpDataSchema,
    },
  },
  "job.mcp.resumed": {
    schema: {
      event: JobMcpDelayedSchema,
      data: JobMcpDataSchema,
    },
  },
  "job.mcp.queued": {
    schema: {
      event: JobMcpQueuedSchema,
      data: JobMcpDataSchema,
    },
  },
  "job.mcp.started": {
    schema: {
      event: JobMcpStartedSchema,
      data: JobMcpDataSchema,
    },
  },
  "job.mcp.completed": {
    schema: {
      event: JobMcpCompletedSchema,
      data: JobCompletedDataSchema,
    },
  },
  "job.mcp.failed": {
    schema: {
      event: JobMcpFailedSchema,
      data: JobFailedDataSchema,
    },
  },
} satisfies Record<
  JobMcpEventType,
  { schema: { event: ZodSchema; data: ZodSchema } }
>;
