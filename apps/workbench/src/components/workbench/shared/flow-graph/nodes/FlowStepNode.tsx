import { Fragment, useEffect } from "react";
import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { Edge as FlowAnalysisEdge } from "@lcase/types";
import type { StepStatus } from "@/components/workbench/shared/flow-graph/use-step-run-info";
import {
  HANDLE_SPACING,
  LR_EDGES_TOP_OFFSET,
  LR_EDGE_SPACING,
  LR_TARGET_HANDLE_TOP,
} from "@/lib/flow-graph-layout";
import { cn } from "@/lib/utils";
import {
  edgeHandleId,
  edgeLabel,
  getGateColor,
  getStatusBorderColor,
  REUSE_BADGE_COLOR,
  SELECTION_RING_COLOR,
  type FlowStepAccent,
} from "./flow-step-accents";
import { SIM_ICON } from "@/components/workbench/shared/tab-icons";

export type FlowStepNodeData = {
  label: string;
  status?: StepStatus;
  reused?: boolean;
  accent: FlowStepAccent;
  outEdges: FlowAnalysisEdge[];
  sourcePosition: Position;
  targetPosition: Position;
  isStart?: boolean;
};

type FlowStepNodeType = Node<FlowStepNodeData>;

// One shared shell for every step type with a custom node (httpjson, mcp,
// join -- see flow-step-accents.ts). Read-only: no fields/content, no
// collapse, nodesConnectable={false} already disables dragging new
// connections from these handles (FlowGraph.tsx).
//
// Spike: out-edge labels live on the node, next to their handle, aligned on
// the same offset -- reads naturally in LR (handles stack vertically along
// the right edge, label sits beside each one). TB is the open question:
// handles spread horizontally along the bottom. Tried rotating the label
// (90deg vertical-rl, then 45deg) to fit it in that narrower horizontal
// space -- both looked bad once actually seen. Settled on flat/unrotated
// text instead, relying on HANDLE_SPACING being wide enough for the two
// (success/failure, capped at 2) labels not to collide -- still an open
// question whether TB is worth supporting for this node design at all.
export function FlowStepNode({
  id,
  data,
  selected,
}: NodeProps<FlowStepNodeType>) {
  const {
    label,
    status,
    accent,
    outEdges,
    sourcePosition,
    targetPosition,
    isStart,
    reused,
  } = data;
  const alongLeft =
    sourcePosition === Position.Bottom || sourcePosition === Position.Top;
  const statusColor = getStatusBorderColor(status);

  // Handle positions here are computed from outEdges/sourcePosition, not
  // fixed at mount -- React Flow caches each handle's measured DOM bounds
  // for drawing edge paths, and that cache goes stale (edge stays pointing
  // at the old spot) unless told to remeasure. This is the officially
  // documented fix for dynamically positioned/added handles, not a
  // workaround.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, outEdges, sourcePosition, targetPosition]);

  return (
    // Handles are meant to sit centered on the border, half in/half out --
    // overflow-hidden (needed on the card below for rounded corners) would
    // clip that outside half into a half-circle. Keeping this outer
    // container un-clipped and moving the rounding/clipping onto an inner
    // wrapper around just the header+body chrome lets handles render as full
    // circles while the card still gets rounded corners.
    <div className="relative h-full w-full">
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-sm bg-neutral-200 dark:bg-card"
        style={
          // Selection ring only now -- status moved to the corner badge
          // below. A border here shared the same visual channel (a colored
          // line on the card) as the gate-colored edges, which is exactly
          // what made a completed/failed node's border compete with its own
          // edges; a badge is a distinct shape/position instead of more
          // border, so it doesn't have that problem.
          selected
            ? {
                boxShadow: `0 0 0 2px var(--color-card), 0 0 0 4px ${SELECTION_RING_COLOR}`,
              }
            : undefined
        }
      >
        <div
          className={cn(
            "flex w-full shrink-0 items-center",
            // TB reads better centered; LR reads better left-aligned next
            // to the step name below it (which does the same split).
            alongLeft ? "justify-center" : "justify-start pl-2",
            accent.colorClassName,
          )}
        >
          <span className="truncate text-xs py-0.5 font-semibold">
            {accent.label}
          </span>
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col px-2 pt-1 text-left text-xs dark:bg-neutral-800",
            alongLeft ? "items-center" : "items-start",
          )}
        >
          {/* The id reads as an extension of the header info, not body
              content -- top-anchored right under the colored strip. Output
              edges start below it (rendered as absolutely-positioned labels
              further down, aligned to each handle's actual offset). */}
          <span className="truncate text-[10px] font-semibold">{label}</span>
        </div>
        {/* <div
          className={cn(
            "flex w-full h-1 shrink-0 items-center dark:bg-pink-400",
            // TB reads better centered; LR reads better left-aligned next
            // to the step name below it (which does the same split).
            alongLeft ? "justify-center" : "justify-start pl-2 ",
            accent.colorClassName,
          )}
        ></div> */}
      </div>

      {/* Status badge -- bottom-right, off the header strip's own corner
          (top-right overlapped the accent color; bottom-right also happens
          to be clear of LR's target-handle area, which anchors near the
          top). Sibling of the card, not a child of it, for the same reason
          the handles are: the card's overflow-hidden would clip a corner
          overlap into a half-circle. Icon shape (not just color) is the
          actual point -- this is what keeps it distinct from the
          gate-colored edges, unlike the border it replaces. */}
      {statusColor && (
        <div
          className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2"
          style={{ background: statusColor, borderColor: "var(--color-card)" }}
        >
          {status === "completed" && (
            // White reads poorly against the green badge specifically --
            // dark instead, unlike the other two icons.
            <CheckIcon className="h-3 w-3 text-neutral-800" strokeWidth={3} />
          )}
          {status === "failed" && (
            <XIcon className="h-3 w-3 text-neutral-800" strokeWidth={3} />
          )}
          {status === "running" && (
            <LoaderCircleIcon
              className="h-3 w-3 animate-spin  dark:text-neutral-800 text-neutral-800"
              strokeWidth={3}
            />
          )}
        </div>
      )}

      {/* Reused badge -- mirrored to the opposite (bottom-left) corner from
          the status badge, same shape/mechanism, different (deliberately
          quieter) color. Fresh redesign replacing the old "↺ " text prefix
          that used to live inline in the label. */}
      {reused && (
        <div
          className="absolute -bottom-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2"
          style={{
            background: REUSE_BADGE_COLOR,
            borderColor: "var(--color-card)",
          }}
        >
          <SIM_ICON className="h-3 w-3 text-neutral-900" strokeWidth={2} />
        </div>
      )}

      <Handle
        type="target"
        position={targetPosition}
        style={{
          ...(alongLeft ? undefined : { top: LR_TARGET_HANDLE_TOP }),
          // The flow's start step has no real incoming edge -- a filled
          // handle here would imply a connection that doesn't exist. Hollow
          // ring instead of hiding it outright, so the slot stays visually
          // consistent with every other node's target handle (same idea
          // could extend to a terminal/end-node treatment later).
          ...(isStart
            ? {
                background: "#1f1f1f",
                border: "1px solid var(--color-muted-foreground, #71717a)",
              }
            : {}),
        }}
      />

      {outEdges.map((edge, index) => {
        // TB stays centered on the node's middle (still experimental --
        // rotated labels need the symmetric spread to have room either
        // side). LR anchors from the top instead, below the header + step
        // name, so a long name can never collide with the first out-edge.
        const centeredOffset =
          (index - (outEdges.length - 1) / 2) * HANDLE_SPACING;
        const topAnchoredOffset = LR_EDGES_TOP_OFFSET + index * LR_EDGE_SPACING;
        const label = edgeLabel(edge);
        return (
          <Fragment key={edgeHandleId(edge)}>
            <Handle
              type="source"
              id={edgeHandleId(edge)}
              position={sourcePosition}
              style={{
                background: getGateColor(edge),
                ...(alongLeft
                  ? { left: `calc(50% + ${centeredOffset}px)` }
                  : { top: topAnchoredOffset }),
              }}
            />
            {label && (
              <span
                className="absolute whitespace-nowrap text-[10px]"
                style={
                  alongLeft
                    ? {
                        // Flat/unrotated -- rotating this looked bad once
                        // actually seen. Only 2 labels max (success/failure),
                        // centered under their own handle; HANDLE_SPACING is
                        // wide enough that the two don't collide.
                        left: `calc(50% + ${centeredOffset}px)`,
                        bottom: 4,
                        transform: "translateX(-50%)",
                      }
                    : {
                        top: topAnchoredOffset,
                        right: 6,
                        transform: "translateY(-50%)",
                      }
                }
              >
                {label}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
