import type { FlowDefinition } from "@lcase/types";
import type { OutEdges } from "@lcase/types";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Controls,
  Panel,
  ReactFlow,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";

import "@xyflow/react/dist/base.css";
import { useTheme } from "@/contexts/use-theme";
import type {
  StepRunInfo,
  StepStatus,
} from "@/components/workbench/shared/flow-graph/use-step-run-info";
import { FIT_VIEW_OPTIONS, type NodePositions } from "@/lib/flow-graph-layout";
import { FlowStepNode } from "@/components/workbench/shared/flow-graph/nodes/FlowStepNode";
import {
  edgeHandleId,
  getEdgeStyle,
  getFlowStepAccent,
  getStatusBorderColor,
} from "@/components/workbench/shared/flow-graph/nodes/flow-step-accents";

// Stable identity across renders -- React Flow re-measures/warns if the
// nodeTypes object passed to <ReactFlow> changes on every render.
const nodeTypes = { flowStep: FlowStepNode };

// Set via inline style, not a Tailwind className: @xyflow/react/dist/style.css
// sets `border` on `.react-flow__node-default` as plain, un-layered CSS, which
// always beats a Tailwind utility class (Tailwind wraps its utilities in
// `@layer utilities`, and any un-layered rule beats any layered rule
// regardless of specificity or source order). Inline style has no such fight.
function statusNodeStyle(status: StepStatus | undefined): {
  className?: string;
  style?: { border: string };
} {
  const color = getStatusBorderColor(status);
  if (!color) return {};
  return {
    ...(status === "running" ? { className: "animate-step-pulse" } : {}),
    style: { border: `2px solid ${color}` },
  };
}

type Props = {
  flowDef: FlowDefinition;
  layout: NodePositions | null;
  outEdges: OutEdges;
  onNodeClickHandler?: (node: Node) => void;
  stepRunInfo?: Record<string, StepRunInfo>;
  reusedStepIds?: string[];
  selectedStepId?: string | null;
  viewport?: Viewport | null;
  onViewportChange?: (viewport: Viewport) => void;
  toolbar?: ReactNode;
  authoringBar?: ReactNode;
};
export function FlowGraph({
  flowDef,
  layout,
  outEdges,
  onNodeClickHandler,
  stepRunInfo,
  reusedStepIds,
  selectedStepId,
  viewport,
  onViewportChange,
  toolbar,
  authoringBar,
}: Props) {
  const { resolvedTheme } = useTheme();

  const graph = useMemo(() => {
    if (!layout) return { nodes: [], edges: [] };

    const graphNodes: Node[] = [];
    const graphEdges: Edge[] = [];
    for (const [node, layoutData] of Object.entries(layout)) {
      const { x, y, width, height, sourcePosition, targetPosition } =
        layoutData;
      const status = stepRunInfo?.[node]?.status;
      const { className, style } = statusNodeStyle(status);
      const reused = reusedStepIds?.includes(node) ?? false;
      const stepType = flowDef.steps[node]?.type;
      const accent = getFlowStepAccent(stepType);
      const nodeOutEdges = outEdges[node] ?? [];

      const graphNode: Node = accent
        ? {
            id: node,
            type: "flowStep",
            position: { x, y },
            sourcePosition,
            targetPosition,
            selected: node === selectedStepId,
            data: {
              label: node,
              status,
              reused,
              accent,
              outEdges: nodeOutEdges,
              sourcePosition,
              targetPosition,
              isStart: node === flowDef.start,
            },
            // Status border lives inside FlowStepNode.tsx itself now, not
            // here -- this Node-level style/className hack only ever
            // existed because default nodes give us no other way in; a
            // custom node can just render its own border matching its own
            // actual (rounded) shape instead.
            style: { width, height },
          }
        : {
            id: node,
            position: { x, y },
            sourcePosition,
            targetPosition,
            data: {
              label: `${reused ? "↺ " : ""}${node}: ${stepType}`,
              status,
            },
            ...(className ? { className } : {}),
            ...(style ? { style } : {}),
          };
      graphNodes.push(graphNode);

      if (accent) {
        // Real per-output handle per wired edge -- no merge-by-target here,
        // that workaround only exists for step types without named source
        // handles to disambiguate a shared source point. No edge label
        // either: the label now lives on the node next to its handle
        // (FlowStepNode.tsx), not floating on the wire.
        for (const edge of nodeOutEdges) {
          const style = getEdgeStyle(edge, stepRunInfo, stepType);
          graphEdges.push({
            id: `${node}-${edge.endStepId}-${edgeHandleId(edge)}`,
            source: node,
            target: edge.endStepId,
            sourceHandle: edgeHandleId(edge),
            style,
            // Always true for a taken edge (running or paused), never for
            // an untaken one -- see getEdgeStyle's own comment for why:
            // animationPlayState (in style) is what actually controls
            // whether it's visibly moving, not this flag.
            animated: style.animationPlayState !== undefined,
          });
        }
      } else if (outEdges[node]) {
        // a branch step can route multiple distinct cases to the same next
        // step -- drawing one edge per case would visually overlap (React
        // Flow has no built-in way to spread edges that share both
        // endpoints apart), so edges to the same target are combined into
        // one, with each case/gate joined into a single label instead.
        const labelsByTarget = new Map<string, string[]>();
        for (const edge of outEdges[node]) {
          const branchCase =
            edge.caseValue ?? (edge.isDefault ? "default" : undefined);
          const label = branchCase ?? edge.gate;
          const labels = labelsByTarget.get(edge.endStepId) ?? [];
          labels.push(label);
          labelsByTarget.set(edge.endStepId, labels);
        }
        for (const [target, labels] of labelsByTarget) {
          const graphEdge: Edge = {
            id: `${node}-${target}`,
            source: node,
            target,
            label: labels.join(" / "),
          };
          graphEdges.push(graphEdge);
        }
      }
    }
    return { nodes: graphNodes, edges: graphEdges };
  }, [flowDef, layout, outEdges, stepRunInfo, reusedStepIds, selectedStepId]);

  // A saved viewport (persisted per-panel, see flow-graph-panels-slice.ts)
  // needs no container measurement at all -- restoring it directly sidesteps
  // the fitView-against-a-not-yet-visible-container bug entirely. Only a
  // genuinely first-ever open (no saved viewport yet) falls back to fitView;
  // defaultViewport and fitView are mutually exclusive per React Flow's own
  // docs, so exactly one of the two is ever passed.
  const viewportProps = viewport
    ? { defaultViewport: viewport }
    : { fitView: true, fitViewOptions: FIT_VIEW_OPTIONS };

  return (
    <div className="h-full w-full rounded-xl">
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme}
        onNodeClick={
          onNodeClickHandler
            ? (_event, node) => onNodeClickHandler(node)
            : undefined
        }
        nodesDraggable={false}
        nodesConnectable={false}
        panActivationKeyCode={null}
        onMoveEnd={
          onViewportChange
            ? (_event, nextViewport) => onViewportChange(nextViewport)
            : undefined
        }
        {...viewportProps}
      >
        {!toolbar && <Controls />}
        {authoringBar && <Panel position="top-center">{authoringBar}</Panel>}
        {toolbar && <Panel position="bottom-center">{toolbar}</Panel>}
      </ReactFlow>
    </div>
  );
}
