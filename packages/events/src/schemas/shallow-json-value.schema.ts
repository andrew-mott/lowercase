import type { ShallowJsonValue } from "@lcase/types";
import { z } from "zod";

/**
 * Accepts a JSON-shaped value without recursively constraining its contents.
 * Job event bodies use this as opaque HTTP JSON payload data.
 */
export const ShallowJsonValueSchema = z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]) satisfies z.ZodType<ShallowJsonValue>;
