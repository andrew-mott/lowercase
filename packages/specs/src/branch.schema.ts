import type { StepBranch } from "@lcase/types";
import { z } from "zod";

export const StepBranchSchema = z
  .object({
    type: z.literal("branch"),
    value: z.string(),
    cases: z.record(z.string(), z.string()),
    default: z.string(),
  })
  .strict() satisfies z.ZodType<StepBranch>;
