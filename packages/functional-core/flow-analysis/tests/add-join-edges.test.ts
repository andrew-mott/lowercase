import { describe, expect, it } from "vitest";
import { addJoinEdges } from "../src/analyze-flow.js";
import type {
  FlowDefinition,
  StepJoin,
  FlowAnalysis,
  InEdges,
  OutEdges,
  SelfReferencedProblem,
  UnknownStepReferenceProblem,
} from "@lcase/types";

describe("addJoinEdge()", () => {
  it("adds corrent new edges when there are no problems", () => {
    const inEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };
    const outEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
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

    const joinStep: StepJoin = {
      type: "join",
      next: "d",
      steps: ["a", "b"],
    };

    const flowDef = {
      steps: {
        a: {},
        b: {},
        c: joinStep,
        d: {},
      },
    } as unknown as FlowDefinition;
    addJoinEdges("c", joinStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        { type: "join", gate: "always", startStepId: "a", endStepId: "c" },
        { type: "join", gate: "always", startStepId: "b", endStepId: "c" },
      ],
      d: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "c",
          endStepId: "d",
        },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
        { type: "join", gate: "always", startStepId: "a", endStepId: "c" },
      ],
      b: [{ type: "join", gate: "always", startStepId: "b", endStepId: "c" }],
      c: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "c",
          endStepId: "d",
        },
      ],
    };

    const expectedJoinDeps = { c: ["a", "b"] };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
    expect(fa.problems).toEqual([]);
    expect(fa.joinDeps).toEqual(expectedJoinDeps);
  });

  it("adds an UnknownStepReference problem when it references an invalid stepId", () => {
    const inEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };
    const outEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
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

    const joinStep: StepJoin = {
      type: "join",
      next: "d",
      steps: ["a", "e"],
    };

    const flowDef = {
      steps: {
        a: {},
        b: {},
        c: joinStep,
        d: {},
      },
    } as unknown as FlowDefinition;
    addJoinEdges("c", joinStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [{ type: "join", gate: "always", startStepId: "a", endStepId: "c" }],
      d: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "c",
          endStepId: "d",
        },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
        { type: "join", gate: "always", startStepId: "a", endStepId: "c" },
      ],
      c: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "c",
          endStepId: "d",
        },
      ],
    };

    const expectedProblem: UnknownStepReferenceProblem = {
      type: "UnknownStepReference",
      startStepId: "e",
      endStepId: "c",
    };

    const expectedJoinDeps = { c: ["a"] };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
    expect(fa.problems).toEqual([expectedProblem]);
    expect(fa.joinDeps).toEqual(expectedJoinDeps);
  });

  it("adds an SelfReferencedProblem problem when it references itself", () => {
    const inEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
    };
    const outEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
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

    const joinStep: StepJoin = {
      type: "join",
      next: "d",
      steps: ["a", "c"],
    };

    const flowDef = {
      steps: {
        a: {},
        b: {},
        c: joinStep,
        d: {},
      },
    } as unknown as FlowDefinition;
    addJoinEdges("c", joinStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [{ type: "join", gate: "always", startStepId: "a", endStepId: "c" }],
      d: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "c",
          endStepId: "d",
        },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
        { type: "join", gate: "always", startStepId: "a", endStepId: "c" },
      ],
      c: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "c",
          endStepId: "d",
        },
      ],
    };

    const expectedProblem: SelfReferencedProblem = {
      type: "SelfReferenced",
      stepId: "c",
    };
    const expectedJoinDeps = { c: ["a"] };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
    expect(fa.problems).toEqual([expectedProblem]);
    expect(fa.joinDeps).toEqual(expectedJoinDeps);
  });
});
