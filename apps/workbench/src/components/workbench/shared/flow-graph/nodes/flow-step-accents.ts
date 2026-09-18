import type { Edge, StepDefinition } from "@lcase/types";
import type {
  StepRunInfo,
  StepStatus,
} from "@/components/workbench/shared/flow-graph/use-step-run-info";

export type FlowStepAccent = {
  label: string;
  colorClassName: string;
};

// Every FlowDefinition step type has an entry -- add here (plus wiring in
// edgeHandleId/edgeLabel/getEdgeStyle below if the edge shape is new) when a
// step type gets its own FlowStepNode variant.
const FLOW_STEP_ACCENTS: Partial<
  Record<StepDefinition["type"], FlowStepAccent>
> = {
  httpjson: {
    label: "httpjson",
    colorClassName: "bg-teal-300 dark:bg-teal-800",
  },
  mcp: { label: "mcp", colorClassName: "bg-lime-300 dark:bg-lime-800" },
  join: { label: "join", colorClassName: "bg-pink-300 dark:bg-pink-800" },
  branch: {
    label: "branch",
    colorClassName: "bg-indigo-300 dark:bg-indigo-800",
  },
  parallel: {
    label: "parallel",
    colorClassName: "bg-pink-300 dark:bg-pink-800",
  },
};

export function getFlowStepAccent(
  type: StepDefinition["type"] | undefined,
): FlowStepAccent | undefined {
  return type ? FLOW_STEP_ACCENTS[type] : undefined;
}

// Edge color communicates the *kind of condition* governing whether an edge
// fires, not which step type is at either end -- parallel's edges are the
// exact same "always taken, not really a condition" kind of edge as join's
// inbound ones, so they share one story rather than each getting a bespoke
// per-type color. Four conditions, four colors:
//   - conditionally success (control onSuccess, and join's own outbound
//     `next` edge -- it only fires if the join actually succeeded)
//   - conditionally failure (control onFailure)
//   - conditionally something else, arbitrary (branch's case/default edges
//     -- a case value isn't inherently good or bad, and neither is default,
//     just "nothing else matched")
//   - unconditional / always taken once reached (parallel's fan-out edges,
//     and join's *inbound* edges -- structural membership, not a real
//     decision point)
export const GATE_SUCCESS_COLOR = "#34d399";
export const GATE_FAILURE_COLOR = "var(--flow-edge-failure)";
// A case value isn't inherently good or bad, and neither is default --
// both currently share one color rather than being distinguished from each
// other, on the theory that the case/default *label* already carries that
// distinction (FlowStepNode.tsx renders the real value next to the handle),
// so the color's job is just "this is a conditional-but-not-success/failure
// branch," not which specific one.
export const BRANCH_CASE_COLOR = "var(--flow-edge-conditional)";
export const BRANCH_DEFAULT_COLOR = "var(--flow-edge-conditional)";
// Warm neutral, not the flat gray React Flow's default edge stroke already
// uses -- that default was never chosen to sit next to a saturated green/
// red, and reads heavier/duller than either. Deliberately not tied to any
// step's own header color -- this is an edge-condition color, not a
// step-type color, the reasoning that moved join's inbound edges away from
// matching its header in the first place.
export const UNCONDITIONAL_EDGE_COLOR = "var(--flow-edge-unconditional)";

// Shared so the handle color (FlowStepNode.tsx) and the edge line color
// (FlowGraph.tsx) that leaves it can't drift apart from each other.
export function getGateColor(edge: Edge): string | undefined {
  if (edge.type === "parallel" || edge.type === "join") {
    return UNCONDITIONAL_EDGE_COLOR;
  }
  if (edge.type === "branch") {
    return edge.isDefault ? BRANCH_DEFAULT_COLOR : BRANCH_CASE_COLOR;
  }
  if (edge.type !== "control") return undefined;
  return edge.gate === "onSuccess" ? GATE_SUCCESS_COLOR : GATE_FAILURE_COLOR;
}

// `edge.gate` is only unique enough to key a handle/edge id when a node has
// at most one edge per gate value, true for control edges (onSuccess/
// onFailure, addCapEdges) and join's own outbound edge (always "onSuccess",
// addJoinEdges) -- but addBranchEdges/addParallelEdges both set gate:
// "always" on *every* edge they produce, so a branch with several cases or a
// parallel with several branches would collide every handle on the same id.
// caseValue is unique per branch.cases entry by construction (it's a Record
// key), plus exactly one isDefault edge, so "default" as its sentinel is
// always safe. Parallel has no case-like field; endStepId is the only
// naturally-distinguishing property per entry (a flow listing the same
// target twice in one parallel would be a degenerate, pointless case, not
// something worth defending against here -- branch's own "two cases share a
// target" overlap is an already-accepted, unfixed quirk elsewhere).
// Exported so FlowGraph.tsx's `sourceHandle` and FlowStepNode.tsx's
// `<Handle id>` can't drift apart on what a given edge's id is.
export function edgeHandleId(edge: Edge): string {
  if (edge.type === "branch") return edge.caseValue ?? "default";
  if (edge.type === "parallel") return edge.endStepId;
  return edge.gate;
}

// Parallel has nothing meaningful to label -- which step runs next is
// already fully conveyed by the edge existing, so it returns null rather
// than a redundant "parallel" repeated under every handle. Branch shows the
// real case value (or "default"), mirroring FlowGraph.tsx's own non-accent
// branch-label logic exactly, instead of the unhelpful literal "branch" a
// naive type-name fallback would show for every case. Join's outbound edge,
// and any other join-typed edge, still just shows its own type name -- the
// only label they've ever needed.
export function edgeLabel(edge: Edge): string | null {
  if (edge.type === "parallel") return null;
  if (edge.type === "branch") {
    return edge.caseValue ?? (edge.isDefault ? "default" : edge.gate);
  }
  if (edge.type !== "control") return edge.type;
  return edge.gate === "onSuccess" ? "success" : "failure";
}

// "Taken" is a dashed + thicker line; everything else is thin and solid --
// deliberately not using opacity at all: dash answers "did this happen"
// immediately, width reinforces it, and opacity would only add a third,
// unnecessary axis rather than a clearer signal.
//
// What "taken" means is a different question per edge type -- covering all
// four (packages/types EdgeType) explicitly, not just the ones a run can
// resolve on the source step's own status:
//   - control (httpjson/mcp's on.success/on.failure, AND join's own
//     outbound `next` edge -- addJoinEdges emits that one as a real control
//     edge): taken once the *source* resolved, matching the gate.
//   - branch: taken once the *source* resolved, matching StepRunInfo's
//     matchedCase (a real case string, or null when the default fired).
//   - parallel: taken once the *target* has started (anything past
//     "initialized") -- the only one of these needing the target's status,
//     since parallel's own status says nothing about which branches have
//     actually kicked off.
//   - join (inbound edges only -- a step listed in a join's `steps`): taken
//     once the *source* step has started (anything past "initialized"),
//     mirroring parallel's own rule exactly -- both are "unconditional,
//     always taken once reached" edges (see the color comment above), not
//     a resolved-vs-not distinction the way control/branch need.
// Exported (not just module-private) so tests can assert relationships
// between these instead of hardcoding literal values that go stale every
// time one gets tuned live in the browser.
export const TAKEN_EDGE_STROKE_WIDTH = 4;
export const UNTAKEN_EDGE_STROKE_WIDTH = 2;
// Static (non-animated) dash pattern -- long dashes with a short gap so it
// reads as "mostly solid, but obviously dashed" rather than a fine dotted
// line, which would compete with the width difference instead of
// reinforcing it.
export const TAKEN_EDGE_DASH = "6 4";

function isEdgeTaken(
  edge: Edge,
  stepRunInfo: Record<string, StepRunInfo> | undefined,
  sourceStepType: StepDefinition["type"] | undefined,
): boolean {
  if (edge.type === "parallel") {
    const targetStatus = stepRunInfo?.[edge.endStepId]?.status;
    return targetStatus !== undefined && targetStatus !== "initialized";
  }

  if (edge.type === "join") {
    const sourceStatus = stepRunInfo?.[edge.startStepId]?.status;
    return sourceStatus !== undefined && sourceStatus !== "initialized";
  }

  if (edge.type === "control" && sourceStepType === "join") {
    // Interim workaround for a known engine gap (docs/todo.md): a join's
    // own status essentially never reaches stepRunInfo (the completedSteps
    // diff that would emit it lives in the wrong planner -- see the todo
    // entry for the full trace), so checking the join's own resolved status
    // like every other control edge below never works. Its outbound `next`
    // edge only ever gets planned once the join actually succeeds
    // (planControlEdge), so the *target* having started is a reliable-enough
    // stand-in for "the join succeeded and took this edge" -- not exact:
    // if `next` also has some other real inbound edge (reachable a second
    // way), this can read "taken" even when that other edge is what
    // actually fired. Drop this branch once the engine emits real join
    // lifecycle events and go back to checking the join's own status.
    const targetStatus = stepRunInfo?.[edge.endStepId]?.status;
    return targetStatus !== undefined && targetStatus !== "initialized";
  }

  const sourceInfo = stepRunInfo?.[edge.startStepId];
  const resolved =
    sourceInfo?.status === "completed" || sourceInfo?.status === "failed";
  if (!resolved) return false;

  if (edge.type === "branch") {
    return edge.isDefault
      ? sourceInfo?.matchedCase === null
      : edge.caseValue === sourceInfo?.matchedCase;
  }

  // control
  return (
    (sourceInfo?.status === "completed" && edge.gate === "onSuccess") ||
    (sourceInfo?.status === "failed" && edge.gate === "onFailure")
  );
}

// A taken edge is either "done" (frozen dash) or "still happening" (dash
// animates) -- see isEdgeAnimating below for which. Deliberately controlled
// via animationPlayState, not React Flow's own `animated` edge flag: that
// flag toggles the `.animated` CSS class on/off entirely, which means the
// underlying `animation` (and its stroke-dashoffset) gets removed outright
// when an edge stops -- snapping stroke-dashoffset back to its resting
// value instantly, wherever the animation happened to be mid-cycle.
// animationPlayState: "paused" instead freezes the animation exactly where
// it was, no snap. getEdgeStyle's caller (FlowGraph.tsx) should always pass
// `animated: true` for a taken edge regardless of whether it's currently
// running or paused -- the CSS class needs to stay present either way for
// animationPlayState to have anything to pause. An *untaken* edge must
// never get `animated: true`: with no animationPlayState override, the
// class's own default `stroke-dasharray: 5` would kick in and dash a line
// that's supposed to read as solid/not-taken.
export function getEdgeStyle(
  edge: Edge,
  stepRunInfo: Record<string, StepRunInfo> | undefined,
  sourceStepType: StepDefinition["type"] | undefined,
): {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  animationPlayState?: "running" | "paused";
} {
  const stroke = getGateColor(edge);
  if (!isEdgeTaken(edge, stepRunInfo, sourceStepType)) {
    return { stroke, strokeWidth: UNTAKEN_EDGE_STROKE_WIDTH };
  }
  return {
    stroke,
    strokeWidth: TAKEN_EDGE_STROKE_WIDTH,
    strokeDasharray: TAKEN_EDGE_DASH,
    animationPlayState: isEdgeAnimating(edge, stepRunInfo, sourceStepType)
      ? "running"
      : "paused",
  };
}

// Never true for an edge that isn't taken at all, and never true once a
// historical/finished run has nothing left in a "running" state -- the
// dashed line still shows which path was taken, it just stops moving (see
// getEdgeStyle above for how "stops" avoids a visual jump).
//
// Which step's "running" status counts as "still happening" mirrors
// isEdgeTaken's own per-type source-vs-target choice, not a blanket
// "check the target" rule -- for a join's *inbound* edges specifically, the
// target (the join itself) is the one whose status never reliably resolves
// (the same engine gap isEdgeTaken already works around for join's
// *outbound* edge), so checking it here would animate forever, long after
// the reporting step actually finished. Every other type's target is a
// regular step with reliable status, so that's the right place to look.
export function isEdgeAnimating(
  edge: Edge,
  stepRunInfo: Record<string, StepRunInfo> | undefined,
  sourceStepType: StepDefinition["type"] | undefined,
): boolean {
  if (!isEdgeTaken(edge, stepRunInfo, sourceStepType)) return false;

  if (edge.type === "join") {
    return stepRunInfo?.[edge.startStepId]?.status === "running";
  }

  return stepRunInfo?.[edge.endStepId]?.status === "running";
}

// Same amber already used for a running step's outline (FlowGraph.tsx's
// statusNodeStyle) -- shared here too, same drift-avoidance reasoning as the
// gate colors above.
export const STATUS_RUNNING_COLOR = "var(--flow-status-running-background)";
export const STATUS_COMPLETED_COLOR = "var(--flow-status-completed-background)";
export const STATUS_FAILED_COLOR = "var(--flow-status-failed-background)";

// Deliberately its own hue, outside the green/amber/red palette status and
// gate colors already claim -- blue is the conventional "this is selected"
// color in most editors, so it reads as a distinct kind of signal rather
// than competing with either of those for the same visual meaning.
export const SELECTION_RING_COLOR = "var(--flow-step-selected)";

// A neutral, deliberately quieter hue than the semantic status/gate/
// selection colors above -- reuse is informational, not a judgment call the
// way success/failure/running are, so it doesn't need to compete for
// attention the way those do.
export const REUSE_BADGE_COLOR = "var(--flow-step-reused-background)";

export function getStatusBorderColor(
  status: StepStatus | undefined,
): string | undefined {
  switch (status) {
    case "running":
      return STATUS_RUNNING_COLOR;
    case "completed":
      return STATUS_COMPLETED_COLOR;
    case "failed":
      return STATUS_FAILED_COLOR;
    default:
      return undefined;
  }
}
