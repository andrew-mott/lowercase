import { describe, expect, it } from "vitest";
import { toposort } from "../src/toposort.js";
import type { FlowAnalysis } from "@lcase/types";

describe("toposort()", () => {
  it("creates a correct toposort", () => {
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

    const sorted = toposort(expectedAnalysis);

    expect(sorted).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});
