import type { EvalScorePayload } from "@lcase/types";
import { z } from "zod";

/**
 * Validates the current judge-flow score artifact before its projection writes
 * the value to durable eval-result storage.
 */
export const EvalScorePayloadSchema = z
  .object({
    overall: z.number(),
    passed: z.boolean(),
    dimensions: z.record(
      z.string(),
      z
        .object({
          score: z.number(),
          rationale: z.string().optional(),
        })
        .strict(),
    ),
    rationale: z.string().optional(),
  })
  .strict() satisfies z.ZodType<EvalScorePayload>;
