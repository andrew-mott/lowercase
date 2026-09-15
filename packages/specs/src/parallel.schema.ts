import type { StepParallel } from "@lcase/types";
import { z } from "zod";

export const StepParallelSchema = z
  .object({
    type: z.literal("parallel"),
    steps: z.array(z.string()),
  })
  .strict() satisfies z.ZodType<StepParallel>;
