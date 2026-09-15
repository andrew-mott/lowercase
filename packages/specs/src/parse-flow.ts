import type { FlowDefinition, Result } from "@lcase/types";
import { FlowSchema } from "./flow.types.js";

/**
 * Simple wrapper around zod schema, returns a Result type, discriminated object
 * union where ok: true gives the flow definition, ok: false has the error string
 *
 * @param data unknown, usually an object
 * @returns { ok: true, value: FlowDefinition } | { ok: false, error: string }
 */
export function parseFlow(data: unknown): Result<FlowDefinition, string> {
  const result = FlowSchema.safeParse(data);
  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
    };
  }
  return {
    ok: true,
    value: result.data,
  };
}
