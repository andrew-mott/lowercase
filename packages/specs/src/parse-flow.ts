import type { FlowDefinition, Result } from "@lcase/types";
import {
  flowValidationIssues,
  validateFlowDefinition,
} from "./flow-validator.js";

/**
 * Validates an unknown value as a flow and returns the established Result
 * boundary. The error remains a string so callers do not depend on AJV.
 *
 * @param data unknown, usually an object
 * @returns { ok: true, value: FlowDefinition } | { ok: false, error: string }
 */
export function parseFlow(data: unknown): Result<FlowDefinition, string> {
  if (!validateFlowDefinition(data)) {
    return {
      ok: false,
      error: JSON.stringify(flowValidationIssues()),
    };
  }
  return {
    ok: true,
    value: data,
  };
}
