import type {
  FlowDefinition,
  StepDefinition,
  StepHttpJson,
  StepMcp,
  StepParallel,
  StepJoin,
  StepBranch,
  Edge,
  FlowAnalysis,
  FlowProblem,
  InEdges,
  OutEdges,
} from "@lcase/types";

/**
 * Given a flow definition, look at each steps dependencies and dependents.
 * In the language of the analyzer, inEdges are dependencies for a step (node).
 * outEdges are dependents for a step.  In/Out is easier to understand from
 * any step's point of view.
 *
 * Builds those edge objects, and saves the nodes.  Saves an array of "problems" for
 * when duplicate stepIds are found, or invalid references are made.  Also stores
 * a quick look each join step, and which steps they depend or wait on.  This
 * separates control flow from the flow definition.
 *
 * Eventually, combine with a system that also searches for
 * interpolated strings inside flow definitions, to see if they refer to
 * proper steps.
 *
 * If toposort becomes useful, that may be added here as well.
 *
 * For now we are just calculating edges for the engine to easily see
 * control flow semantics. Edges have a gate, which should be used to inform how
 * to process path, and when to take them.  That field is experiment and will
 * need to be proven out in the engine.
 *
 * This pure function core logic should be usable within UI or CLI layers in
 * addition to the engine.
 *
 * @param flow
 * @returns FlowAnalysis object
 */
export function analyzeFlow(flow: FlowDefinition): FlowAnalysis {
  const fa: FlowAnalysis = {
    inEdges: {},
    outEdges: {},
    nodes: [],
    joinDeps: {},
    problems: [],
    refs: [],
  };

  for (const stepId in flow.steps) {
    const step = flow.steps[stepId];
    if (fa.nodes.includes(stepId)) {
      addProblem({ type: "DuplicateStepId", stepId }, fa.problems);
      continue;
    }
    fa.nodes.push(stepId);

    if (step.type === "parallel") {
      addParallelEdges(stepId, step, fa, flow);
      continue;
    }
    if (step.type === "join") {
      addJoinEdges(stepId, step, fa, flow);
      continue;
    }
    if (step.type === "branch") {
      addBranchEdges(stepId, step, fa, flow);
      continue;
    }
    if (step.type === "httpjson" || step.type === "mcp") {
      addCapEdges(stepId, step, fa, flow);
    }
  }

  return fa;
}

export function addParallelEdges(
  stepId: string,
  step: StepParallel,
  fa: FlowAnalysis,
  flow: FlowDefinition,
) {
  for (const endStepId of step.steps) {
    const hasProblems = checkAndAddProblems(
      flow.steps[endStepId],
      fa.problems,
      stepId,
      endStepId,
    );
    if (hasProblems) continue;

    addEdge(fa.inEdges, fa.outEdges, {
      type: "parallel",
      gate: "always",
      startStepId: stepId,
      endStepId,
    });
  }
}

export function addJoinEdges(
  stepId: string,
  step: StepJoin,
  fa: FlowAnalysis,
  flow: FlowDefinition,
) {
  for (const startStepId of step.steps) {
    const hasProblems = checkAndAddProblems(
      flow.steps[startStepId],
      (fa.problems ??= []),
      startStepId,
      stepId,
    );
    if (hasProblems) continue;

    addEdge(fa.inEdges, fa.outEdges, {
      startStepId,
      endStepId: stepId,
      type: "join",
      gate: "always",
    });
    (fa.joinDeps[stepId] ??= []).push(startStepId);
  }

  const hasProblems = checkAndAddProblems(
    flow.steps[step.next],
    (fa.problems ??= []),
    stepId,
    step.next,
  );
  if (hasProblems) return;
  addEdge(fa.inEdges, fa.outEdges, {
    startStepId: stepId,
    endStepId: step.next,
    type: "control",
    gate: "onSuccess",
  });
}

export function addBranchEdges(
  stepId: string,
  step: StepBranch,
  fa: FlowAnalysis,
  flow: FlowDefinition,
) {
  for (const [caseValue, endStepId] of Object.entries(step.cases)) {
    const hasProblems = checkAndAddProblems(
      flow.steps[endStepId],
      fa.problems,
      stepId,
      endStepId,
    );
    if (hasProblems) continue;

    addEdge(fa.inEdges, fa.outEdges, {
      startStepId: stepId,
      endStepId,
      type: "branch",
      gate: "always",
      caseValue,
    });
  }

  const hasDefaultProblems = checkAndAddProblems(
    flow.steps[step.default],
    fa.problems,
    stepId,
    step.default,
  );
  if (hasDefaultProblems) return;
  addEdge(fa.inEdges, fa.outEdges, {
    startStepId: stepId,
    endStepId: step.default,
    type: "branch",
    gate: "always",
    isDefault: true,
  });
}

export function addCapEdges(
  stepId: string,
  step: StepMcp | StepHttpJson,
  fa: FlowAnalysis,
  flow: FlowDefinition,
) {
  if (step.on?.success) {
    const hasProblems = checkAndAddProblems(
      flow.steps[step.on.success],
      fa.problems,
      stepId,
      step.on.success,
    );
    if (!hasProblems) {
      addEdge(fa.inEdges, fa.outEdges, {
        startStepId: stepId,
        endStepId: step.on.success,
        type: "control",
        gate: "onSuccess",
      });
    }
  }
  if (step.on?.failure) {
    const hasProblems = checkAndAddProblems(
      flow.steps[step.on.failure],
      fa.problems,
      stepId,
      step.on.failure,
    );
    if (!hasProblems) {
      addEdge(fa.inEdges, fa.outEdges, {
        startStepId: stepId,
        endStepId: step.on.failure,
        type: "control",
        gate: "onFailure",
      });
    }
  }
}

export function checkAndAddProblems(
  step: StepDefinition | undefined,
  problems: FlowProblem[],
  startStepId: string,
  endStepId?: string,
): boolean {
  if (!step) {
    addProblem(
      {
        type: "UnknownStepReference",
        startStepId: startStepId,
        endStepId: endStepId ?? "unknown",
      },
      problems,
    );
    return true;
  }
  if (startStepId === endStepId) {
    addProblem(
      {
        type: "SelfReferenced",
        stepId: startStepId,
      },
      problems,
    );
    return true;
  }
  return false;
}

export function addProblem<T extends FlowProblem>(
  fields: T,
  problems: FlowProblem[],
): FlowProblem[] {
  problems.push({ ...fields });
  return problems;
}

export function addEdge(inEdges: InEdges, outEdges: OutEdges, edge: Edge) {
  (inEdges[edge.endStepId] ??= []).push(edge);
  (outEdges[edge.startStepId] ??= []).push(edge);
}
