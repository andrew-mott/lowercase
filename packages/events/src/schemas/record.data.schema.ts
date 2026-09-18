import type { ReplayModeSubmittedData } from "@lcase/types";
import { z } from "zod";

export const ReplayModeSubmittedDataSchema = z
  .object({
    enableSideEffects: z.boolean(),
  })
  .strict() satisfies z.ZodType<ReplayModeSubmittedData>;
