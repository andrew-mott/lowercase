import dagre from "@dagrejs/dagre";
import { Position } from "@xyflow/react";
import type {
  FlowAnalysis,
  FlowDefinition,
  StepDefinition,
} from "@lcase/types";
import { getFlowStepAccent } from "@/components/workbench/shared/flow-graph/nodes/flow-step-accents";

export type LayoutDirection = "TB" | "LR";

// Shared between FlowGraph.tsx's auto-fit and RunToolbar's manual Fit View
// button, so the two can never drift apart. Lives here, not in
// FlowGraph.tsx, since exporting a plain constant alongside a component
// breaks this repo's react-refresh/only-export-components lint rule.
export const FIT_VIEW_OPTIONS = { padding: 0.5 };

export type NodePositions = Record<
  string,
  {
    x: number;
    y: number;
    width: number;
    height: number;
    sourcePosition: Position;
    targetPosition: Position;
  }
>;

// Plain, fixed-size default for every step type that has no custom node yet
// -- still true for branch/parallel (see sizeForNode below).
const NODE_WIDTH = 200;
const NODE_HEIGHT = 50;

// A custom FlowStepNode needs far less width than a plain default box --
// no field content, just a header strip + short id, so a narrower base
// reads better. Kept separate from NODE_WIDTH so this doesn't ripple into
// dagre's spacing assumptions for the other, still-plain-box step types.
// Also sets the margin from the outermost handle to the node's edge in TB
// (that margin works out to exactly half this value, regardless of edge
// count -- the growth added for extra handles only widens the gap between
// them, not the margin outside them).
const CUSTOM_NODE_WIDTH = 100;

// Every step type with a custom node (flow-step-accents.ts's
// FLOW_STEP_ACCENTS) varies its size, growing along whichever axis its real
// (wired) out-edges spread their handles along -- one handle per entry in
// outEdges[node] (up to 2 for httpjson/mcp's onSuccess/onFailure, exactly 1
// for join's next). Feeding dagre a size that doesn't match the node's
// actual rendered box is exactly the dagre+React-Flow gotcha this file used
// to warn about generically; this keeps the two in lockstep by construction
// instead of by convention.
// Exported so FlowStepNode.tsx can space its rendered <Handle>s using the
// exact same unit dagre sized the node's growth with -- same drift-avoidance
// reasoning as FIT_VIEW_OPTIONS above. Wide enough that TB's flat (unrotated)
// "success"/"failure" labels -- each roughly 35-45px at 10px font -- don't
// collide when centered under two handles this far apart; a rough estimate,
// not measured against the real rendered font.
export const HANDLE_SPACING = 45;

// LR-specific: out-edges anchor from the top (below the header + step name)
// rather than spreading around the node's center, so these are their own
// constants rather than reusing HANDLE_SPACING. Exported so FlowStepNode.tsx
// positions its handles/labels using the exact values height was sized
// against -- same drift-avoidance reasoning as HANDLE_SPACING above.
export const LR_EDGES_TOP_OFFSET = 46;
export const LR_EDGE_SPACING = 15;
// A fixed gap below the last handle regardless of edge count -- unlike the
// top offset, this doesn't need to clear any header/label chrome, just read
// as consistent breathing room.
const LR_BOTTOM_MARGIN = 20;

// The target (input) handle has no cardinality problem -- always exactly
// one -- but without an explicit position it defaults to React Flow's
// top: 50%, and LR's height now varies with out-edge count, so that "50%"
// lands at a different absolute pixel per node. Pinning it near the step
// name instead keeps it in the same spot regardless of how many outputs a
// given node has. A rough estimate of where the name sits, not measured.
export const LR_TARGET_HANDLE_TOP = 30;

// TB's out-edge labels are flat/unrotated text (rotating them at 45deg
// looked bad once seen) sitting just above the handle row -- one line's
// worth of vertical room, not the taller clearance a rotated label needed.
const TB_LABEL_CLEARANCE = 14;

function sizeForNode(
  stepType: StepDefinition["type"] | undefined,
  outEdgeCount: number,
  direction: LayoutDirection,
): { width: number; height: number } {
  if (!getFlowStepAccent(stepType)) {
    return { width: NODE_WIDTH, height: NODE_HEIGHT };
  }
  if (direction === "LR") {
    const height =
      outEdgeCount > 0
        ? LR_EDGES_TOP_OFFSET +
          (outEdgeCount - 1) * LR_EDGE_SPACING +
          LR_BOTTOM_MARGIN
        : NODE_HEIGHT;
    return { width: CUSTOM_NODE_WIDTH, height };
  }
  const growth = Math.max(0, outEdgeCount - 1) * HANDLE_SPACING;
  const height = NODE_HEIGHT + (outEdgeCount > 0 ? TB_LABEL_CLEARANCE : 0);
  return { width: CUSTOM_NODE_WIDTH + growth, height };
}

// Mirrors graphLayout()'s own early-out (packages/flow-analysis) -- no
// toposort means a cycle was detected, nothing sensible to lay out.
export function computeDagreLayout(
  fa: FlowAnalysis,
  direction: LayoutDirection,
  flowDef: FlowDefinition,
): NodePositions | null {
  if (!fa.toposort) return null;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  const sizes: Record<string, { width: number; height: number }> = {};
  for (const node of fa.nodes) {
    const size = sizeForNode(
      flowDef.steps[node]?.type,
      fa.outEdges[node]?.length ?? 0,
      direction,
    );
    sizes[node] = size;
    g.setNode(node, size);
  }
  for (const node of fa.nodes) {
    for (const edge of fa.outEdges[node] ?? []) {
      g.setEdge(edge.startStepId, edge.endStepId);
    }
  }

  // dagre's crossing-reduction sweeps (lib/order) find a 0-crossing order on
  // the very first pass for a plain fan-out (initOrder's DFS already
  // preserves our outEdges declaration order on a from-scratch layout), but
  // then keep sweeping for up to 4 more tied iterations and take whichever
  // *later* tied layout comes out, not the earliest -- so a node's children
  // can end up visibly reordered from how we declared them for no actual
  // crossing-count benefit. disableOptimalOrderHeuristic skips those sweeps
  // entirely, keeping initOrder's result (which does match declared order).
  // Global toggle, not scoped to fan-outs specifically -- trading away
  // dagre's crossing minimization everywhere, including genuinely tangled
  // parts of a larger graph where it'd otherwise help. Trying this against
  // real flows to see whether that trade is worth it.
  dagre.layout(g, { disableOptimalOrderHeuristic: true });

  // Default (plain-box) nodes render their connection handles at
  // sourcePosition/targetPosition, defaulting to Bottom/Top -- fine for a
  // vertical layout, but every edge draws top-to-bottom regardless of
  // where dagre actually placed the nodes otherwise, which looks wrong for
  // a horizontal layout. Flip to Right/Left for LR so handles land on the
  // sides the nodes are actually arranged along.
  const sourcePosition = direction === "LR" ? Position.Right : Position.Bottom;
  const targetPosition = direction === "LR" ? Position.Left : Position.Top;

  // dagre's own {x,y} is each node's center; React Flow's `position` is
  // top-left -- offset by half that node's own size (not a shared constant,
  // now that size can vary per node) to convert.
  const positions: NodePositions = {};
  for (const node of fa.nodes) {
    const { x, y } = g.node(node);
    const { width, height } = sizes[node];
    positions[node] = {
      x: x - width / 2,
      y: y - height / 2,
      width,
      height,
      sourcePosition,
      targetPosition,
    };
  }
  return positions;
}
