import { isNonEmptyString, validateFlowHash } from "../run-request-fields.js";

export type InlineRun = {
  flowId: string;
  flowVersionId: string;
  flowDefHash: string;
};

/**
 * Reads the `run` part's JSON. It says which flow to run and nothing about
 * the inputs, which travel as their own parts.
 */
export function parseInlineRun(
  raw: string,
): { ok: true; value: InlineRun } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Part "run" is not valid JSON' };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Part "run" must be a JSON object' };
  }

  const { flowId, flowVersionId, flowDefHash } = parsed as Record<
    string,
    unknown
  >;
  if (!isNonEmptyString(flowId)) return { ok: false, error: "Invalid flowId" };
  if (!isNonEmptyString(flowVersionId)) {
    return { ok: false, error: "Invalid flowVersionId" };
  }
  const validFlowDefHash = validateFlowHash(flowDefHash);
  if (!validFlowDefHash) return { ok: false, error: "Invalid flowDefHash" };

  return {
    ok: true,
    value: { flowId, flowVersionId, flowDefHash: validFlowDefHash },
  };
}
