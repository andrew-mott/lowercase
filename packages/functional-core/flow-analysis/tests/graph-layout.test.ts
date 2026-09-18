import { describe, expect, it } from "vitest";
import { graphLayout } from "../src/graph-layout.js";
import type { FlowAnalysis } from "@lcase/types";

describe("graphLayout()", () => {
  it("creates a correct toposort", () => {
    const fa: FlowAnalysis = {
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
      toposort: ["a", "b", "c", "d", "e", "f", "g"],
      refs: [],
    };

    const layout = graphLayout(fa);

    expect(layout).toEqual([["a"], ["b", "c"], ["d"], ["e"], ["f", "g"]]);
  });
});
