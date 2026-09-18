import { describe, expect, it } from "vitest";
import { analyzeFlow } from "../src/analyze-flow.js";
import type {
  FlowAnalysis,
  FlowDefinition,
  StepHttpJson,
  StepJoin,
  StepParallel,
} from "@lcase/types";

describe("analyzeFlow()", () => {
  it("analyzed a valid flow correctly with the right edges", () => {
    const parallelStepA: StepParallel = {
      type: "parallel",
      steps: ["b", "c"],
    };
    const httpJsonStepB: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
    };
    const httpJsonStepC: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
    };
    const joinStepD: StepJoin = {
      type: "join",
      next: "e",
      steps: ["b", "c"],
    };
    const httpJsonStepE: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
      on: {
        success: "f",
        failure: "g",
      },
    };
    const httpJsonStepF: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
    };
    const httpJsonStepG: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
    };

    const flowDef = {
      steps: {
        a: parallelStepA,
        b: httpJsonStepB,
        c: httpJsonStepC,
        d: joinStepD,
        e: httpJsonStepE,
        f: httpJsonStepF,
        g: httpJsonStepG,
      },
    } as unknown as FlowDefinition;

    const analysis = analyzeFlow(flowDef);

    const expectedAnalysis: FlowAnalysis = {
      inEdges: {
        b: [
          {
            type: "parallel",
            gate: "always",
            startStepId: "a",
            endStepId: "b",
          },
        ],
        c: [
          {
            type: "parallel",
            gate: "always",
            startStepId: "a",
            endStepId: "c",
          },
        ],
        d: [
          { type: "join", gate: "always", startStepId: "b", endStepId: "d" },
          { type: "join", gate: "always", startStepId: "c", endStepId: "d" },
        ],
        e: [
          {
            type: "control",
            gate: "onSuccess",
            startStepId: "d",
            endStepId: "e",
          },
        ],
        f: [
          {
            type: "control",
            gate: "onSuccess",
            startStepId: "e",
            endStepId: "f",
          },
        ],
        g: [
          {
            type: "control",
            gate: "onFailure",
            startStepId: "e",
            endStepId: "g",
          },
        ],
      },
      outEdges: {
        a: [
          {
            type: "parallel",
            gate: "always",
            startStepId: "a",
            endStepId: "b",
          },
          {
            type: "parallel",
            gate: "always",
            startStepId: "a",
            endStepId: "c",
          },
        ],
        b: [{ type: "join", gate: "always", startStepId: "b", endStepId: "d" }],
        c: [{ type: "join", gate: "always", startStepId: "c", endStepId: "d" }],
        d: [
          {
            type: "control",
            gate: "onSuccess",
            startStepId: "d",
            endStepId: "e",
          },
        ],
        e: [
          {
            type: "control",
            gate: "onSuccess",
            startStepId: "e",
            endStepId: "f",
          },
          {
            type: "control",
            gate: "onFailure",
            startStepId: "e",
            endStepId: "g",
          },
        ],
      },
      joinDeps: { d: ["b", "c"] },
      nodes: ["a", "b", "c", "d", "e", "f", "g"],
      problems: [],
      refs: [],
    };

    expect(analysis).toEqual(expectedAnalysis);
  });
});
