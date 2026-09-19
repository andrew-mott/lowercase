import type {
  FlowAnalysis,
  FlowDefinition,
  FlowProblem,
  Path,
  Ref,
} from "@lcase/types";
import { classifyContentType } from "./artifact-compat.js";
import { parseStepRefs } from "./parse-references.js";
import { stepExports } from "./step-exports.js";

/**
 * Takes a flow definition, loops through steps, parses, and adds references
 * found in step definitions to the provided flow analysis object.
 *
 * Skips control flow step types including "parallel" and "join".
 * Support for references in control flow steps will be added in the future.
 * @param fd FlowDefinition object
 * @param fa FlowAnalysis object
 * @returns FlowAnalysis
 */
export function analyzeRefs(fd: FlowDefinition, fa: FlowAnalysis) {
  fa.exportRefsByStep ??= {};
  for (const stepId of Object.keys(fd.steps)) {
    const stepType = fd.steps[stepId].type;
    // skip control flow step types for now
    if (stepType === "parallel" || stepType === "join") continue;
    findAndParseRefs(stepId, fd, fa);
  }

  for (const ref of fa.refs) {
    const problem =
      validateRefTargetStep(ref, fd, fa) ??
      validateRefTargetParam(ref, fd) ??
      validateExportRefPath(ref, fd) ??
      validateBinaryRefPosition(ref, fd);
    if (problem) fa.problems.push(problem);
  }
  return fa;
}

/**
 * Parses the references found within a single step.  Adds the reference and
 * problems to the flow analysis provided.
 * @param stepId StepId string
 * @param fd FlowDefinition
 * @param fa FlowAnalysis
 */
export function findAndParseRefs(
  stepId: string,
  fd: FlowDefinition,
  fa: FlowAnalysis,
) {
  const { refs, exportRefs, problems } = parseStepRefs(
    fd.steps[stepId],
    stepId,
  );
  fa.refs = fa.refs.concat(refs);
  fa.exportRefsByStep ??= {};
  fa.exportRefsByStep[stepId] = exportRefs;
  fa.problems = fa.problems.concat(problems);
}

/**
 * Checks to see if a reference refers to a valid stepId, and that there is a
 * reachable path between the target step in the reference, and the step which
 * holds the reference.  Edges represent dependencies in terms of execution
 * order, and we just see that a path is possible with isReachable().
 * @param ref Reference object
 * @param fd FlowDefinition object
 * @param fa FlowAnalysis object
 * @returns FlowProblem | undefined if no problem was found
 */
export function validateRefTargetStep(
  ref: Ref,
  fd: FlowDefinition,
  fa: FlowAnalysis,
): FlowProblem | undefined {
  // check and see if its a step scope, that the step exists
  if (ref.scope !== "steps") return;
  const targetStepId = ref.string.split(".")[1];

  if (targetStepId === undefined || fd.steps[targetStepId] === undefined) {
    return {
      type: "InvalidRefStepId",
      ref,
      targetStepId,
    };
  }
  const reachable = isReachable(ref.stepId, targetStepId, fa);
  if (!reachable) {
    return {
      type: "UnreachableRef",
      ref,
      targetStepId,
    };
  }
}

export function validateRefTargetParam(
  ref: Ref,
  fd: FlowDefinition,
): FlowProblem | undefined {
  if (ref.scope !== "params") return;
  const paramName = ref.valuePath[1];
  if (
    typeof paramName !== "string" ||
    fd.params === undefined ||
    fd.params[paramName] === undefined
  ) {
    return {
      type: "InvalidRefParamName",
      ref,
      paramName: typeof paramName === "string" ? paramName : "",
    };
  }
}

/**
 * Checks that a downstream reference into another step's export doesn't
 * traverse a nested path when that export is declared as a string-backed
 * type (text/plain or text/markdown) -- string-backed exports only support
 * binding the whole value, mirroring the same rule enforced for run params.
 */
export function validateExportRefPath(
  ref: Ref,
  fd: FlowDefinition,
): FlowProblem | undefined {
  if (ref.scope !== "steps" || ref.valuePath[2] !== "exports") return;
  const sourceStepId = ref.valuePath[1];
  const exportName = ref.valuePath[3];
  if (typeof sourceStepId !== "string" || typeof exportName !== "string") {
    return;
  }

  const sourceStep = fd.steps[sourceStepId];
  if (!sourceStep) return;

  const declaration = stepExports(sourceStep)?.[exportName];
  if (!declaration || declaration.type === "application/json") return;

  if (ref.valuePath.length > 4) {
    return {
      type: "InvalidExportRefPath",
      ref,
      exportName,
      sourceStepId,
    };
  }
}
/**
 * A binary-classified param may only be referenced as the whole value of an
 * http step's body.artifact or a multipart file's artifact field -- anywhere
 * else, the ref would have to be turned into a string, which a binary value
 * can't be. Only params can be binary today (exports are always
 * JSON-derived), so this only ever looks at params-scope refs.
 */
export function validateBinaryRefPosition(
  ref: Ref,
  fd: FlowDefinition,
): FlowProblem | undefined {
  if (ref.scope !== "params") return;
  const paramName = ref.valuePath[1];
  if (typeof paramName !== "string") return;

  const declaration = fd.params?.[paramName];
  if (!declaration || classifyContentType(declaration.type) !== "binary") {
    return;
  }

  const step = fd.steps[ref.stepId];
  if (
    step?.type === "http" &&
    !ref.interpolated &&
    isArtifactBindPath(ref.bindPath)
  ) {
    return;
  }

  return { type: "InvalidBinaryRefPosition", ref, paramName };
}

function isArtifactBindPath(bindPath: Path): boolean {
  if (bindPath[0] !== "body") return false;
  if (bindPath.length === 2 && bindPath[1] === "artifact") return true;
  return (
    bindPath.length === 4 &&
    bindPath[1] === "multipart" &&
    bindPath[3] === "artifact"
  );
}

/**
 * Recursively checks out edges from the target stepId to the stepId with the
 * reference.  A depth first type sort.
 * @param refStepId StepId the reference lives in
 * @param targetStepId StepId the reference references (targets)
 * @param fa The FlowAnalysis
 * @returns true if its reachable, false if not
 */
export function isReachable(
  refStepId: string,
  targetStepId: string,
  fa: FlowAnalysis,
): boolean {
  if (!fa.outEdges[targetStepId]) return false;
  for (const outEdge of fa.outEdges[targetStepId]) {
    if (outEdge.endStepId === refStepId) return true;
    if (isReachable(refStepId, outEdge.endStepId, fa)) return true;
  }
  return false;
}
