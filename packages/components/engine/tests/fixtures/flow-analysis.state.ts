import type { FlowAnalysis } from "@lcase/types";

const stepId = "test-stepid";
export const flowAnalysis: FlowAnalysis = {
  nodes: ["parallel", stepId],
  inEdges: {
    [stepId]: [
      {
        startStepId: "parallel",
        endStepId: stepId,
        type: "parallel",
        gate: "always",
      },
    ],
  },
  outEdges: {
    parallel: [
      {
        startStepId: "parallel",
        endStepId: stepId,
        type: "parallel",
        gate: "always",
      },
    ],
  },
  joinDeps: {},
  problems: [],
  refs: [],
};

export const flowAnalysisB: FlowAnalysis = {
  nodes: ["parallel", "b"],
  inEdges: {
    b: [
      {
        startStepId: "parallel",
        endStepId: "b",
        type: "parallel",
        gate: "always",
      },
    ],
  },
  outEdges: {
    parallel: [
      {
        startStepId: "parallel",
        endStepId: "b",
        type: "parallel",
        gate: "always",
      },
    ],
  },
  joinDeps: {},
  problems: [],
  refs: [],
  exportRefsByStep: {
    b: {},
  },
};

export const flowAnalysisBWithProblem: FlowAnalysis = {
  nodes: ["parallel", "b"],
  inEdges: {},
  outEdges: {},
  joinDeps: {},
  problems: [
    {
      type: "UnknownStepReference",
      endStepId: "c",
      startStepId: "parallel",
    },
  ],
  refs: [],
};
