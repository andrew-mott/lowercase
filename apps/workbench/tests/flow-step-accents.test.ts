import { describe, expect, it } from "vitest";
import type { Edge } from "@lcase/types";
import type { StepRunInfo } from "@/components/workbench/shared/flow-graph/use-step-run-info";
import {
  BRANCH_CASE_COLOR,
  BRANCH_DEFAULT_COLOR,
  edgeHandleId,
  edgeLabel,
  GATE_FAILURE_COLOR,
  GATE_SUCCESS_COLOR,
  getEdgeStyle,
  isEdgeAnimating,
  TAKEN_EDGE_DASH,
  TAKEN_EDGE_STROKE_WIDTH,
  UNCONDITIONAL_EDGE_COLOR,
  UNTAKEN_EDGE_STROKE_WIDTH,
} from "@/components/workbench/shared/flow-graph/nodes/flow-step-accents";

function edge(overrides: Partial<Edge> & Pick<Edge, "type">): Edge {
  return {
    startStepId: "source",
    endStepId: "target",
    gate: "always",
    ...overrides,
  };
}

function runInfo(status: StepRunInfo["status"], matchedCase?: string | null) {
  return { source: { status, matchedCase } } as Record<string, StepRunInfo>;
}

describe("edgeHandleId()", () => {
  it("is unique per branch case, plus the default, even though they all share gate 'always'", () => {
    const ok = edge({ type: "branch", caseValue: "ok" });
    const retry = edge({ type: "branch", caseValue: "retry" });
    const fallback = edge({ type: "branch", isDefault: true });
    const ids = [ok, retry, fallback].map(edgeHandleId);
    expect(new Set(ids).size).toBe(3);
    expect(edgeHandleId(fallback)).toBe("default");
  });

  it("is unique per parallel entry via endStepId, even though they all share gate 'always'", () => {
    const toB = edge({ type: "parallel", endStepId: "b" });
    const toC = edge({ type: "parallel", endStepId: "c" });
    expect(edgeHandleId(toB)).not.toBe(edgeHandleId(toC));
    expect(edgeHandleId(toB)).toBe("b");
  });

  it("still keys control/join edges off gate, unchanged", () => {
    expect(edgeHandleId(edge({ type: "control", gate: "onSuccess" }))).toBe(
      "onSuccess",
    );
    expect(edgeHandleId(edge({ type: "join", gate: "always" }))).toBe("always");
  });
});

describe("edgeLabel()", () => {
  it("returns the real case value, or 'default', for branch edges", () => {
    expect(edgeLabel(edge({ type: "branch", caseValue: "ok" }))).toBe("ok");
    expect(edgeLabel(edge({ type: "branch", isDefault: true }))).toBe(
      "default",
    );
  });

  it("returns null for parallel edges -- nothing meaningful to label", () => {
    expect(edgeLabel(edge({ type: "parallel" }))).toBeNull();
  });

  it("is unchanged for control/join edges", () => {
    expect(edgeLabel(edge({ type: "control", gate: "onSuccess" }))).toBe(
      "success",
    );
    expect(edgeLabel(edge({ type: "control", gate: "onFailure" }))).toBe(
      "failure",
    );
    expect(edgeLabel(edge({ type: "join" }))).toBe("join");
  });
});

// These assert relationships/shape (taken is wider+dashed, untaken isn't,
// colors match the exported constants) rather than hardcoded literal
// numbers/strings, since the actual values are being tuned live in the
// browser and would otherwise go stale on every tweak.
describe("getEdgeStyle()", () => {
  function expectUntaken(style: ReturnType<typeof getEdgeStyle>) {
    expect(style.strokeWidth).toBe(UNTAKEN_EDGE_STROKE_WIDTH);
    expect(style.strokeDasharray).toBeUndefined();
  }

  function expectTaken(style: ReturnType<typeof getEdgeStyle>) {
    expect(style.strokeWidth).toBe(TAKEN_EDGE_STROKE_WIDTH);
    expect(style.strokeDasharray).toBe(TAKEN_EDGE_DASH);
  }

  it("control edges: plain while unresolved, dashed+thick once taken, plain again once resolved but untaken", () => {
    const onSuccess = edge({ type: "control", gate: "onSuccess" });
    const onFailure = edge({ type: "control", gate: "onFailure" });

    expectUntaken(getEdgeStyle(onSuccess, runInfo("running"), "httpjson"));

    const taken = getEdgeStyle(onSuccess, runInfo("completed"), "httpjson");
    expect(taken.stroke).toBe(GATE_SUCCESS_COLOR);
    expectTaken(taken);

    const untaken = getEdgeStyle(onFailure, runInfo("completed"), "httpjson");
    expect(untaken.stroke).toBe(GATE_FAILURE_COLOR);
    expectUntaken(untaken);
  });

  it("branch edges: plain while unresolved, dashed+thick the matched case (including default), plain for the rest", () => {
    const ok = edge({ type: "branch", caseValue: "ok" });
    const retry = edge({ type: "branch", caseValue: "retry" });
    const fallback = edge({ type: "branch", isDefault: true });

    expectUntaken(getEdgeStyle(ok, runInfo("running", null), "branch"));

    const taken = getEdgeStyle(ok, runInfo("completed", "ok"), "branch");
    expect(taken.stroke).toBe(BRANCH_CASE_COLOR);
    expectTaken(taken);

    expectUntaken(getEdgeStyle(retry, runInfo("completed", "ok"), "branch"));

    const takenDefault = getEdgeStyle(
      fallback,
      runInfo("completed", null),
      "branch",
    );
    expect(takenDefault.stroke).toBe(BRANCH_DEFAULT_COLOR);
    expectTaken(takenDefault);
  });

  it("a failed branch resolution (matchedCase never set) leaves every edge untaken, none dashed", () => {
    const ok = edge({ type: "branch", caseValue: "ok" });
    const fallback = edge({ type: "branch", isDefault: true });
    const info = { source: { status: "failed" as const } } as Record<
      string,
      StepRunInfo
    >;
    expectUntaken(getEdgeStyle(ok, info, "branch"));
    expectUntaken(getEdgeStyle(fallback, info, "branch"));
  });

  it("parallel edges: plain until the target has started, dashed+thick after, never fades", () => {
    const toTarget = edge({ type: "parallel", endStepId: "target" });
    const notStarted = { target: { status: "initialized" as const } };
    const started = { target: { status: "running" as const } };

    const untaken = getEdgeStyle(toTarget, notStarted, "parallel");
    expect(untaken.stroke).toBe(UNCONDITIONAL_EDGE_COLOR);
    expectUntaken(untaken);
    expectUntaken(getEdgeStyle(toTarget, undefined, "parallel"));

    expectTaken(getEdgeStyle(toTarget, started, "parallel"));
  });

  it("join's inbound edges (a listed step reporting into the join): taken once the source has started at all, mirroring parallel's own rule -- this was completely broken before, always falling through to untaken", () => {
    const fromTask = edge({ type: "join", endStepId: "merge" });

    expectUntaken(getEdgeStyle(fromTask, undefined, "httpjson"));

    // Taken as soon as the source is reached, not just once it resolves --
    // there's no "untaken sibling" for a join input the way control/branch
    // have, so "reported in" starts the moment the step begins, in flight
    // or done either way (this is also what makes it possible to animate
    // while the source is still running, see isEdgeAnimating below).
    const takenWhileRunning = getEdgeStyle(
      fromTask,
      runInfo("running"),
      "httpjson",
    );
    expect(takenWhileRunning.stroke).toBe(UNCONDITIONAL_EDGE_COLOR);
    expectTaken(takenWhileRunning);

    expectTaken(getEdgeStyle(fromTask, runInfo("completed"), "httpjson"));

    // A source step that failed still "reported in" to the join -- the edge
    // itself isn't a success/failure branch, so it's taken either way.
    expectTaken(getEdgeStyle(fromTask, runInfo("failed"), "httpjson"));
  });

  it("join's own outbound edge is a real control edge under the hood (addJoinEdges), but its source status is a known engine gap that never resolves -- reads the target having started instead, as an interim stand-in", () => {
    const toNext = edge({ type: "control", gate: "onSuccess" });
    const notStarted = { target: { status: "initialized" as const } };
    const started = { target: { status: "completed" as const } };

    expectUntaken(getEdgeStyle(toNext, notStarted, "join"));
    expectUntaken(getEdgeStyle(toNext, undefined, "join"));
    expectTaken(getEdgeStyle(toNext, started, "join"));

    // Confirms it's the target, not the source, being consulted here --
    // the join's own (unreliable) status is irrelevant to this workaround.
    const sourceOnlyResolved = { source: { status: "completed" as const } };
    expectUntaken(getEdgeStyle(toNext, sourceOnlyResolved, "join"));
  });
});

describe("getEdgeStyle()'s animationPlayState", () => {
  it("is undefined for an untaken edge -- never animated at all", () => {
    const onSuccess = edge({ type: "control", gate: "onSuccess" });
    expect(
      getEdgeStyle(onSuccess, runInfo("running"), "httpjson")
        .animationPlayState,
    ).toBeUndefined();
  });

  it("is 'running' for a taken edge whose target is still running", () => {
    const onSuccess = edge({ type: "control", gate: "onSuccess" });
    const runningTarget = {
      source: { status: "completed" as const },
      target: { status: "running" as const },
    };
    expect(
      getEdgeStyle(onSuccess, runningTarget, "httpjson").animationPlayState,
    ).toBe("running");
  });

  it("is 'paused' (not undefined) for a taken edge whose target has already finished -- frozen in place, not un-animated", () => {
    const onSuccess = edge({ type: "control", gate: "onSuccess" });
    const finishedTarget = {
      source: { status: "completed" as const },
      target: { status: "completed" as const },
    };
    expect(
      getEdgeStyle(onSuccess, finishedTarget, "httpjson").animationPlayState,
    ).toBe("paused");
  });
});

describe("isEdgeAnimating()", () => {
  it("never animates an edge that isn't taken at all", () => {
    const onSuccess = edge({ type: "control", gate: "onSuccess" });
    expect(isEdgeAnimating(onSuccess, runInfo("running"), "httpjson")).toBe(
      false,
    );
    expect(isEdgeAnimating(onSuccess, undefined, "httpjson")).toBe(false);
  });

  it("control/branch/parallel: animates while the target is running, stops once it resolves (a finished/historical run never animates, but stays taken)", () => {
    const onSuccess = edge({ type: "control", gate: "onSuccess" });
    const runningTarget = {
      source: { status: "completed" as const },
      target: { status: "running" as const },
    };
    const finishedTarget = {
      source: { status: "completed" as const },
      target: { status: "completed" as const },
    };
    expect(isEdgeAnimating(onSuccess, runningTarget, "httpjson")).toBe(true);
    expect(isEdgeAnimating(onSuccess, finishedTarget, "httpjson")).toBe(false);
    expect(
      getEdgeStyle(onSuccess, finishedTarget, "httpjson").strokeDasharray,
    ).toBe(TAKEN_EDGE_DASH);
  });

  it("join's inbound edge: animates while the *source* (reporting step) is running, not the target -- the join's own status never resolves, so using it here would animate forever", () => {
    const fromTask = edge({ type: "join", endStepId: "merge" });
    expect(isEdgeAnimating(fromTask, runInfo("running"), "httpjson")).toBe(
      true,
    );
    // Even if the join itself (target) looks perpetually "running" -- the
    // known engine gap -- the source having finished stops the animation.
    const sourceFinishedTargetStuck = {
      source: { status: "completed" as const },
      merge: { status: "running" as const },
    };
    expect(
      isEdgeAnimating(fromTask, sourceFinishedTargetStuck, "httpjson"),
    ).toBe(false);
  });

  it("join's own outbound edge (workaround): animates while the next target is running, mirroring the same target-based check isEdgeTaken already uses for it", () => {
    const toNext = edge({ type: "control", gate: "onSuccess" });
    expect(
      isEdgeAnimating(
        toNext,
        { target: { status: "running" as const } },
        "join",
      ),
    ).toBe(true);
    expect(
      isEdgeAnimating(
        toNext,
        { target: { status: "completed" as const } },
        "join",
      ),
    ).toBe(false);
  });
});
