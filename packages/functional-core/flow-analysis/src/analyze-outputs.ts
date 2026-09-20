import type { FlowDefinition, FlowProblem } from "@lcase/types";
import { getRefStrings, makePath } from "./parse-references.js";
import { stepExports, stepHasOutput } from "./step-exports.js";

export type OutputTarget =
  | { kind: "output"; stepId: string }
  | { kind: "export"; stepId: string; exportName: string };

/**
 * Reads an output's payload as a reference to one step's whole output
 * (`{{steps.X.output}}`) or one of its exports (`{{steps.X.exports.NAME}}`).
 * The reference has to be the entire payload, with nothing around it and no
 * path or transform after it -- composing a result from several references
 * isn't supported yet.
 * @returns the step and export it points at, undefined if it isn't that shape
 */
export function parseOutputPayload(payload: string): OutputTarget | undefined {
  const matches = getRefStrings(payload);
  if (matches.length !== 1) return;

  const [whole, refString, scope, transform] = matches[0];
  if (whole !== payload || scope !== "steps" || transform) return;

  const path = makePath(refString);
  const stepId = path[1];
  if (typeof stepId !== "string") return;

  if (path.length === 3 && path[2] === "output") {
    return { kind: "output", stepId };
  }
  const exportName = path[3];
  if (
    path.length === 4 &&
    path[2] === "exports" &&
    typeof exportName === "string"
  ) {
    return { kind: "export", stepId, exportName };
  }
}

/**
 * Checks each declared flow output: its payload has to be a whole-value
 * reference, to a step that exists, and to an export that step declares or an
 * output it produces. There is no reachability check -- an output may point
 * at a step a branch can skip, which shows up as a missing output when the
 * result is read.
 */
export function validateFlowOutputs(fd: FlowDefinition): FlowProblem[] {
  const problems: FlowProblem[] = [];

  for (const [outputName, output] of Object.entries(fd.outputs ?? {})) {
    const target = parseOutputPayload(output.payload);
    if (!target) {
      problems.push({
        type: "InvalidFlowOutputPayload",
        outputName,
        payloadDefinition: output.payload,
      });
      continue;
    }

    const step = fd.steps[target.stepId];
    const reason = !step
      ? "unknown-step"
      : target.kind === "output"
        ? stepHasOutput(step)
          ? undefined
          : "no-output"
        : stepExports(step)?.[target.exportName]
          ? undefined
          : "undeclared-export";

    if (reason) {
      problems.push({
        type: "InvalidFlowOutputTarget",
        outputName,
        targetStepId: target.stepId,
        reason,
      });
    }
  }

  return problems;
}
