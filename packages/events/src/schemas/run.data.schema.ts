import { z } from "zod";
import type {
  RunStartedData,
  RunCompletedData,
  RunFailedData,
  RunRequestedData,
  RunDeniedData,
} from "@lcase/types";

export const RunRequestedDataSchema = z
  .object({
    flowId: z.string(),
    flowVersionId: z.string(),
    flowDefHash: z.string(),
    simId: z.string().optional(),
    forkSpecHash: z.string().optional(),
    experimentId: z.string().optional(),
    targetRunId: z.string().optional(),
    targetStepId: z.string().optional(),
    targetExportName: z.string().optional(),
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict() satisfies z.ZodType<RunRequestedData>;

export const RunStartedDataSchema =
  z.null() satisfies z.ZodType<RunStartedData>;

export const RunCompletedDataSchema =
  RunStartedDataSchema satisfies z.ZodType<RunCompletedData>;

export const RunFailedDataSchema =
  RunStartedDataSchema satisfies z.ZodType<RunFailedData>;

export const RunDeniedDataSchema = z
  .object({
    error: z.string(),
  })
  .strict() satisfies z.ZodType<RunDeniedData>;
