import type {
  FlowDefinition,
  FlowOutputResult,
  RunStepProjectionRecord,
} from "@lcase/types";
import { parseOutputPayload } from "./analyze-outputs.js";

export type OutputStepRecord = Pick<
  RunStepProjectionRecord,
  "stepId" | "status" | "outputHash" | "exports"
>;

const notProduced: FlowOutputResult = {
  ok: false,
  error: { reason: "not-produced" },
};

/**
 * Works out what each of a flow's declared outputs points at for one run,
 * from the run's recorded steps. Every declared output gets an entry: a
 * missing one says why it has no value rather than being left out.
 *
 * This looks only at the steps, not at the run's own status. A step with no
 * record never started, which on a finished run means a branch skipped it;
 * on a run still in progress it just hasn't been reached, so the caller is
 * expected to only ask about finished runs.
 * @param fd FlowDefinition object
 * @param steps the run's recorded steps
 * @returns each output name mapped to its hash, or the reason it has none
 */
export function resolveFlowOutputs(
  fd: FlowDefinition,
  steps: OutputStepRecord[],
): Record<string, FlowOutputResult> {
  const results: Record<string, FlowOutputResult> = {};

  for (const [outputName, output] of Object.entries(fd.outputs ?? {})) {
    // validation rejects a payload this can't read; if one gets here anyway,
    // it has no value rather than throwing while a caller reads a run
    const target = parseOutputPayload(output.payload);
    const step = target && steps.find((s) => s.stepId === target.stepId);
    if (!target || !step) {
      results[outputName] = notProduced;
      continue;
    }

    if (step.status === "failure") {
      results[outputName] = { ok: false, error: { reason: "step-failed" } };
      continue;
    }

    const hash =
      target.kind === "output"
        ? step.outputHash
        : step.exports?.find((e) => e.name === target.exportName)?.artifactHash;
    results[outputName] = hash ? { ok: true, value: { hash } } : notProduced;
  }

  return results;
}
