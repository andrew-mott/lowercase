import { describe, expect, it } from "vitest";
import { addParallelEdges } from "../src/analyze-flow.js";
import type {
  FlowDefinition,
  StepParallel,
  FlowAnalysis,
  InEdges,
  OutEdges,
  SelfReferencedProblem,
  UnknownStepReferenceProblem,
} from "@lcase/types";

describe("addParallelEdges()", () => {
  it("adds corrent new edges when there are no problems", () => {
    const inEdges: InEdges = {
      b: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };
    const outEdges: OutEdges = {
      a: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };

    const fa: FlowAnalysis = {
      inEdges,
      outEdges,
      nodes: [],
      joinDeps: {},
      problems: [],
      refs: [],
    };

    const parallelStep: StepParallel = {
      type: "parallel",
      steps: ["c", "d"],
    };

    const flowDef = {
      steps: {
        a: {},
        b: parallelStep,
        c: {},
        d: {},
      },
    } as unknown as FlowDefinition;
    addParallelEdges("b", parallelStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "c" },
      ],
      d: [
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "d" },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      b: [
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "c" },
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "d" },
      ],
    };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
    expect(fa.problems).toEqual([]);
  });

  it("adds an UnknownStepReference problem when it references an invalid stepId", () => {
    const inEdges: InEdges = {
      b: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };
    const outEdges: OutEdges = {
      a: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };

    const fa: FlowAnalysis = {
      inEdges,
      outEdges,
      nodes: [],
      joinDeps: {},
      problems: [],
      refs: [],
    };

    const parallelStep: StepParallel = {
      type: "parallel",
      steps: ["c", "e"],
    };

    const flowDef = {
      steps: {
        a: {},
        b: parallelStep,
        c: {},
        d: {},
      },
    } as unknown as FlowDefinition;
    addParallelEdges("b", parallelStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "c" },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      b: [
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "c" },
      ],
    };

    const expectedProblem: UnknownStepReferenceProblem = {
      type: "UnknownStepReference",
      startStepId: "b",
      endStepId: "e",
    };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
    expect(fa.problems).toEqual([expectedProblem]);
  });

  it("adds an SelfReferencedProblem problem when it references itself", () => {
    const inEdges: InEdges = {
      b: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };
    const outEdges: OutEdges = {
      a: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };

    const fa: FlowAnalysis = {
      inEdges,
      outEdges,
      nodes: [],
      joinDeps: {},
      problems: [],
      refs: [],
    };

    const parallelStep: StepParallel = {
      type: "parallel",
      steps: ["c", "b"],
    };

    const flowDef = {
      steps: {
        a: {},
        b: parallelStep,
        c: {},
        d: {},
      },
    } as unknown as FlowDefinition;
    addParallelEdges("b", parallelStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "c" },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      b: [
        { type: "parallel", gate: "always", startStepId: "b", endStepId: "c" },
      ],
    };

    const expectedProblem: SelfReferencedProblem = {
      type: "SelfReferenced",
      stepId: "b",
    };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
    expect(fa.problems).toEqual([expectedProblem]);
  });
});
