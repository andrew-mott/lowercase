import type { StepJoin } from "@lcase/types";
import { z } from "zod";

export const StepJoinSchema = z
  .object({
    type: z.literal("join"),
    steps: z.array(z.string()),
    next: z.string(),
  })
  .strict() satisfies z.ZodType<StepJoin>;
