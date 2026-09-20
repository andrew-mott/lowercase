import type { FlowProblem, InvalidFlowOutputTargetProblem } from "@lcase/types";

export function formatProblem(problem: FlowProblem): string {
  switch (problem.type) {
    case "UnknownStepReference":
      return `Step "${problem.startStepId}" routes to unknown step "${problem.endStepId}".`;
    case "DuplicateStepId":
      return `Step id "${problem.stepId}" is used more than once.`;
    case "SelfReferenced":
      return `Step "${problem.stepId}" references itself.`;
    case "InvalidRefParamName":
      return `Step "${problem.ref.stepId}" references unknown param "${problem.paramName}".`;
    case "InvalidExportRef":
      return `Step "${problem.stepId}"'s export "${problem.exportName}" has an invalid ref value "${problem.exportValue}".`;
    case "InvalidExportRefPath":
      return `Step "${problem.ref.stepId}" references export "${problem.exportName}" on step "${problem.sourceStepId}", but "${problem.ref.string}" doesn't resolve to a valid path.`;
    case "InvalidRefStepId":
      return `Step "${problem.ref.stepId}" references step "${problem.targetStepId}", which doesn't exist.`;
    case "UnreachableRef":
      return `Step "${problem.ref.stepId}" references step "${problem.targetStepId}", which isn't guaranteed to run before it.`;
    case "InvalidRefScope":
      return `Step "${problem.stepId}" has an invalid reference scope in "${problem.refString}".`;
    case "InvalidBinaryRefPosition":
      return `Step "${problem.ref.stepId}" references binary param "${problem.paramName}" somewhere other than an http step's body.artifact or a multipart file's artifact field.`;
    case "InvalidFlowOutputPayload":
      return `Flow output "${problem.outputName}" has payload "${problem.payloadDefinition}", which isn't a single reference to a step's output or export.`;
    case "InvalidFlowOutputTarget":
      return formatOutputTarget(problem);
    case "CycleDetected":
      return "This flow has a cycle somewhere among its steps.";
  }
}

function formatOutputTarget(problem: InvalidFlowOutputTargetProblem): string {
  const output = `Flow output "${problem.outputName}"`;
  switch (problem.reason) {
    case "unknown-step":
      return `${output} references step "${problem.targetStepId}", which doesn't exist.`;
    case "undeclared-export":
      return `${output} references an export that step "${problem.targetStepId}" doesn't declare.`;
    case "no-output":
      return `${output} references the output of step "${problem.targetStepId}", which doesn't produce one.`;
  }
}
