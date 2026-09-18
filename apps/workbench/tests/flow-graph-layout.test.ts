import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { computeDagreLayout } from "@/lib/flow-graph-layout";
import type {
  FlowAnalysis,
  FlowDefinition,
  StepDefinition,
} from "@lcase/types";

// Every real step type now has a FLOW_STEP_ACCENTS entry (httpjson, mcp,
// join, branch, parallel), so this "parallel" filler is itself custom-sized
// like any other -- the tests below that aren't specifically about sizing
// only check rank order/existence/handle positions, none of which depend on
// exact width/height, so that's fine. Tests that ARE about sizing override
// specific nodes' step types directly (see "grows an ... node's size" below).
function buildFlowDef(
  overrides: Record<string, StepDefinition> = {},
): FlowDefinition {
  const steps: Record<string, StepDefinition> = {};
  for (const node of ["a", "b", "c", "d", "e", "f", "g", "orphan"]) {
    steps[node] = { type: "parallel", steps: [] };
  }
  return {
    name: "fixture",
    version: "1",
    start: "a",
    steps: { ...steps, ...overrides },
  };
}

// Mirrors the fixture shape in packages/flow-analysis/tests/graph-layout.test.ts
// (a -> {b, c} -> join at d -> e -> {f, g}), so the two algorithms' behavior
// on the same graph shape is easy to compare by reading both test files.
function buildFixture(): FlowAnalysis {
  return {
    inEdges: {
      b: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
      ],
      c: [
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "c" },
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
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "b" },
        { type: "parallel", gate: "always", startStepId: "a", endStepId: "c" },
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
}

describe("computeDagreLayout()", () => {
  it("returns a position for every node in the flow", () => {
    const positions = computeDagreLayout(buildFixture(), "TB", buildFlowDef());
    expect(positions).not.toBeNull();
    expect(Object.keys(positions!).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
  });

  it("lays out earlier steps above later ones in TB, left-to-right in LR", () => {
    const tb = computeDagreLayout(buildFixture(), "TB", buildFlowDef())!;
    expect(tb.a.y).toBeLessThan(tb.b.y);
    expect(tb.b.y).toBeLessThan(tb.d.y);

    const lr = computeDagreLayout(buildFixture(), "LR", buildFlowDef())!;
    expect(lr.a.x).toBeLessThan(lr.b.x);
    expect(lr.b.x).toBeLessThan(lr.d.x);
  });

  it("still includes a node with no edges at all (not just root-reachable ones)", () => {
    const fa = buildFixture();
    fa.nodes = [...fa.nodes, "orphan"];
    const positions = computeDagreLayout(fa, "TB", buildFlowDef())!;
    expect(positions.orphan).toBeDefined();
  });

  it("returns null when no toposort exists (cycle detected)", () => {
    const fa = buildFixture();
    fa.toposort = undefined;
    expect(computeDagreLayout(fa, "TB", buildFlowDef())).toBeNull();
  });

  it("gives every node bottom/top handles in TB, left/right handles in LR", () => {
    const tb = computeDagreLayout(buildFixture(), "TB", buildFlowDef())!;
    expect(tb.a.sourcePosition).toBe(Position.Bottom);
    expect(tb.a.targetPosition).toBe(Position.Top);

    const lr = computeDagreLayout(buildFixture(), "LR", buildFlowDef())!;
    expect(lr.a.sourcePosition).toBe(Position.Right);
    expect(lr.a.targetPosition).toBe(Position.Left);
  });

  it("sizes a node with no step definition at all (undefined type) at the flat default", () => {
    // Every real step type has an accent now, so the only way left to
    // exercise sizeForNode's fallback branch is a node flow-analysis knows
    // about but the flow definition doesn't -- flowDef.steps[node]?.type
    // resolves to undefined, same as a malformed/incomplete flow def would.
    const flowDef = buildFlowDef();
    delete flowDef.steps.g;
    const tb = computeDagreLayout(buildFixture(), "TB", flowDef)!;
    expect(tb.g.width).toBe(200);
    expect(tb.g.height).toBe(50);
  });

  it("grows an httpjson node's width (TB) with its real out-edge count, and its height by a flat clearance whenever it has at least one", () => {
    // "e" has 2 out-edges in the fixture (onSuccess -> f, onFailure -> g);
    // "d" has exactly 1 (onSuccess -> e); "g" has none.
    const flowDef = buildFlowDef({
      d: { type: "httpjson", url: "https://example.com" },
      e: { type: "httpjson", url: "https://example.com" },
      g: { type: "httpjson", url: "https://example.com" },
    });
    const tb = computeDagreLayout(buildFixture(), "TB", flowDef)!;

    expect(tb.e.width).toBe(145); // 100 + (2 - 1) * 45
    expect(tb.e.height).toBe(64); // 50 + 14 clearance (flat label room)
    expect(tb.d.width).toBe(100); // 1 out-edge -> no width growth
    expect(tb.d.height).toBe(64); // still >= 1 out-edge -> same clearance
    expect(tb.g.width).toBe(100); // 0 out-edges -> no growth
    expect(tb.g.height).toBe(50); // 0 out-edges -> no clearance needed
  });

  it("grows an httpjson node's height (LR) with its real out-edge count, width unchanged", () => {
    // "e" has 2 out-edges, "d" has 1, "g" has 0 -- LR height anchors from the
    // top offset (below header + step name) plus a fixed bottom margin, not
    // a flat base + growth, so a 0-edge node stays at the plain default.
    const flowDef = buildFlowDef({
      d: { type: "httpjson", url: "https://example.com" },
      e: { type: "httpjson", url: "https://example.com" },
      g: { type: "httpjson", url: "https://example.com" },
    });
    const lr = computeDagreLayout(buildFixture(), "LR", flowDef)!;
    expect(lr.e.height).toBe(81); // 46 + (2 - 1) * 15 + 20
    expect(lr.e.width).toBe(100);
    expect(lr.d.height).toBe(66); // 46 + (1 - 1) * 15 + 20
    expect(lr.g.height).toBe(50); // 0 out-edges -> plain default, no anchor
  });

  it("grows an mcp node's size (TB) with the same formula as httpjson -- confirms sizeForNode keys off accent presence, not a hardcoded step type", () => {
    // "e" has 2 out-edges in the fixture, same shape mcp shares with httpjson
    const flowDef = buildFlowDef({
      e: {
        type: "mcp",
        url: "https://example.com",
        transport: "http",
        feature: { primitive: "tool", name: "example" },
      },
    });
    const tb = computeDagreLayout(buildFixture(), "TB", flowDef)!;
    expect(tb.e.width).toBe(145); // 100 + (2 - 1) * 45, same as httpjson
    expect(tb.e.height).toBe(64);
  });

  it("sizes a join node's single out-edge like httpjson's 1-out-edge case (no width growth)", () => {
    // "d" has exactly 1 out-edge in the fixture (its own `next`)
    const flowDef = buildFlowDef({
      d: { type: "join", steps: ["b", "c"], next: "e" },
    });
    const tb = computeDagreLayout(buildFixture(), "TB", flowDef)!;
    expect(tb.d.width).toBe(100); // 1 out-edge -> no width growth
    expect(tb.d.height).toBe(64); // still >= 1 out-edge -> same clearance
  });

  it("grows a branch node's size (TB) with the same formula as httpjson -- branch's unbounded cardinality still uses the same sizing, no special-casing this PR", () => {
    // "e" has 2 out-edges in the fixture, same shape a branch with a case
    // and a default would produce
    const flowDef = buildFlowDef({
      e: { type: "branch", value: "$.foo", cases: { ok: "f" }, default: "g" },
    });
    const tb = computeDagreLayout(buildFixture(), "TB", flowDef)!;
    expect(tb.e.width).toBe(145); // 100 + (2 - 1) * 45, same as httpjson
    expect(tb.e.height).toBe(64);
  });

  it("grows a parallel node's size (TB) with the same formula as httpjson", () => {
    // "a" has 2 out-edges in the fixture (to b and c)
    const flowDef = buildFlowDef({
      a: { type: "parallel", steps: ["b", "c"] },
    });
    const tb = computeDagreLayout(buildFixture(), "TB", flowDef)!;
    expect(tb.a.width).toBe(145); // 100 + (2 - 1) * 45, same as httpjson
    expect(tb.a.height).toBe(64);
  });
});
