import { describe, expect, it } from "vitest";
import { isReachable } from "../src/analyze-references.js";
import type { FlowAnalysis } from "@lcase/types";

describe("isReachable()", () => {
  it("is reachable for a simple case", () => {
    const fa = {
      outEdges: {
        targetStepId: [{ endStepId: "refStepId" }],
      },
    } as unknown as FlowAnalysis;
    const result = isReachable("refStepId", "targetStepId", fa);
    expect(result).toBe(true);
  });

  it("is reachable for a recursive case", () => {
    const refStepId = "e";
    const targetStepId = "a";
    const fa = {
      outEdges: {
        a: [{ endStepId: "b" }, { endStepId: "c" }],
        c: [{ endStepId: "d" }, { endStepId: "e" }],
      },
    } as unknown as FlowAnalysis;
    const reachable = isReachable(refStepId, targetStepId, fa);
    expect(reachable).toBe(true);
  });
  it("is not reachable when its not found recursively", () => {
    const refStepId = "f";
    const targetStepId = "a";
    const fa = {
      outEdges: {
        a: [{ endStepId: "b" }, { endStepId: "c" }],
        c: [{ endStepId: "d" }, { endStepId: "e" }],
      },
    } as unknown as FlowAnalysis;
    const reachable = isReachable(refStepId, targetStepId, fa);
    expect(reachable).toBe(false);
  });
});
