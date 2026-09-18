import type { ShallowJsonValue } from "@lcase/types";
import { z } from "zod";

export const ShallowJsonValueSchema = z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]) satisfies z.ZodType<ShallowJsonValue>;
