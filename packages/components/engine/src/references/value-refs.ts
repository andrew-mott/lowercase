import type { FlowDefinition, Ref, RunContext } from "@lcase/types";

/**
 * Makes an array of value ref objects for a list of references.
 * This should be added to job event payloads and processed later by the
 * worker to resolve JSON paths to a value locally.
 *
 * Only processes template references which refer to step outputs.
 * Does not yet support inputs or other resolutions.
 *
 * @param refs Template strings parsed by flow analysis in reference object form
 * @param runContext The run context within the engine.
 * @returns ValueRef[] array of value ref objects
 */
export function makeStepRefs(
  stepId: string,
  allRefs: Ref[],
  stepContext: RunContext["steps"],
  params: RunContext["params"],
  paramDefinitions?: FlowDefinition["params"],
  stepDefinitions?: FlowDefinition["steps"],
): Ref[] {
  const stepRefs = getStepRefs(allRefs, stepId);

  const jobRefs: Ref[] = [];
  for (const ref of stepRefs) {
    if (ref.scope !== "steps" && ref.scope !== "params") continue;
    const valuePath =
      ref.scope === "params"
        ? ref.valuePath.slice(2)
        : ref.valuePath[2] === "exports"
          ? ref.valuePath.slice(4)
          : ref.valuePath[2] === "output"
            ? ref.valuePath.slice(3)
            : ref.valuePath.slice(2);
    const jobRef: Ref = {
      ...ref,
      valuePath,
      hash: getRefHash(ref, stepContext, params),
      ...(ref.scope === "params"
        ? {
            paramType: getParamType(ref, paramDefinitions),
          }
        : ref.scope === "steps" && ref.valuePath[2] === "exports"
          ? {
              exportType: getExportType(ref, stepDefinitions),
            }
          : {}),
    };
    jobRefs.push(jobRef);
  }
  return jobRefs;
}

/**
 * Get the hash value from previous step outputs, from run context.
 * Only works with step output references.  Used in conjunction with
 * makeStepValueRefs create value ref arrays, specific data structures meant to
 * be processed by the worker to resolve json tree values from a content
 * addressable storage through an "artifacts" system.
 *
 * @param ref
 * @param runContext
 * @returns string of the hash or null if reference is empty
 */
export function getRefHash(
  ref: Ref,
  stepContext: RunContext["steps"],
  params: RunContext["params"],
): string | null {
  if (ref.scope === "params") {
    const paramName = ref.valuePath[1];
    if (typeof paramName !== "string") return null;
    return params[paramName] ?? null;
  }
  if (ref.scope !== "steps") return null;

  const step = stepContext[ref.valuePath[1]];
  if (step === undefined) return null;

  if (ref.valuePath[2] === "exports") {
    const exportName = ref.valuePath[3];
    if (typeof exportName !== "string") return null;
    return step.exportHashes[exportName] ?? null;
  }

  return step.outputHash;
}

/**
 * Convenience filter function for matching references to stepIds
 * @param refs References to search though
 * @param stepId StepId to match
 * @returns Ref[] which have ref.stepId === stepId
 */
export function getStepRefs(refs: Ref[], stepId: string) {
  const stepRefs = refs.filter((ref) => ref.stepId === stepId);
  return stepRefs;
}

function getParamType(
  ref: Ref,
  paramDefinitions?: FlowDefinition["params"],
): NonNullable<FlowDefinition["params"]>[string]["type"] | undefined {
  const paramName = ref.valuePath[1];
  if (typeof paramName !== "string" || !paramDefinitions) return undefined;
  return paramDefinitions[paramName]?.type;
}

function getExportType(
  ref: Ref,
  stepDefinitions?: FlowDefinition["steps"],
): Ref["exportType"] {
  const sourceStepId = ref.valuePath[1];
  const exportName = ref.valuePath[3];
  if (
    typeof sourceStepId !== "string" ||
    typeof exportName !== "string" ||
    !stepDefinitions
  ) {
    return undefined;
  }
  const sourceStep = stepDefinitions[sourceStepId];
  if (!sourceStep || sourceStep.type !== "httpjson") return undefined;
  return sourceStep.exports?.[exportName]?.type;
}
