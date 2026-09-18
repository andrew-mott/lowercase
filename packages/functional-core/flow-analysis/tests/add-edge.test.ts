import { describe, expect, it } from "vitest";
import { addEdge } from "../src/analyze-flow.js";
import type { Edge, InEdges, OutEdges } from "@lcase/types";

describe("addEdge()", () => {
  it("adds new edge to inEdges and outEdges", () => {
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
    const edge: Edge = {
      type: "control",
      gate: "always",
      startStepId: "a",
      endStepId: "c",
    };
    addEdge(inEdges, outEdges, edge);

    const expectedInEdges: InEdges = {
      b: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "c" },
      ],
    };

    const expectedOutEdges: OutEdges = {
      a: [
        { type: "control", gate: "always", startStepId: "a", endStepId: "b" },
        { type: "control", gate: "always", startStepId: "a", endStepId: "c" },
      ],
    };

    expect(inEdges).toEqual(expectedInEdges);
    expect(outEdges).toEqual(expectedOutEdges);
  });
});
