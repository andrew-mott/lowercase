import { describe, expect, it } from "vitest";
import { addCapEdges } from "../src/analyze-flow.js";
import type {
  FlowDefinition,
  StepHttpJson,
  FlowAnalysis,
  InEdges,
  OutEdges,
  SelfReferencedProblem,
  UnknownStepReferenceProblem,
} from "@lcase/types";

describe("addCapEdges()", () => {
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

    const httpJsonStep: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
      on: {
        success: "c",
        failure: "d",
      },
    };

    const flowDef = {
      steps: {
        a: {},
        b: httpJsonStep,
        c: {},
        d: {},
      },
    } as unknown as FlowDefinition;

    addCapEdges("b", httpJsonStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "b",
          endStepId: "c",
        },
      ],
      d: [
        {
          type: "control",
          gate: "onFailure",
          startStepId: "b",
          endStepId: "d",
        },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      b: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "b",
          endStepId: "c",
        },
        {
          type: "control",
          gate: "onFailure",
          startStepId: "b",
          endStepId: "d",
        },
      ],
    };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
    expect(fa.problems).toEqual([]);
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

    const httpJsonStep: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
      on: {
        success: "c",
        failure: "e",
      },
    };

    const flowDef = {
      steps: {
        a: {},
        b: httpJsonStep,
        c: {},
        d: {},
      },
    } as unknown as FlowDefinition;

    addCapEdges("b", httpJsonStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "b",
          endStepId: "c",
        },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      b: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "b",
          endStepId: "c",
        },
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

    const httpJsonStep: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
      on: {
        success: "c",
        failure: "b",
      },
    };

    const flowDef = {
      steps: {
        a: {},
        b: httpJsonStep,
        c: {},
        d: {},
      },
    } as unknown as FlowDefinition;

    addCapEdges("b", httpJsonStep, fa, flowDef);

    const expectedInEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "b",
          endStepId: "c",
        },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      b: [
        {
          type: "control",
          gate: "onSuccess",
          startStepId: "b",
          endStepId: "c",
        },
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
