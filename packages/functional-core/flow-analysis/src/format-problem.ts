import type { FlowProblem } from "@lcase/types";

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
    case "CycleDetected":
      return "This flow has a cycle somewhere among its steps.";
  }
}
