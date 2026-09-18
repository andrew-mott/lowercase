import type { FlowAnalysis } from "@lcase/types";

export function graphLayout(fa: FlowAnalysis) {
  if (!fa.toposort) return;

  const nodeRowMap = new Map<string, number>();
  const pendingNodes = new Set<string>();
  const grid: string[][] = [[]];

  for (const node of fa.toposort) {
    if (fa.inEdges[node] === undefined) {
      grid[0].push(node);
      nodeRowMap.set(node, 0);
      const outTargetNodes = getOutTargetNodes(node, fa);
      addToPending(outTargetNodes, pendingNodes);
    } else {
      break;
    }
  }

  let currentRow = 1;
  while (nodeRowMap.size < fa.toposort.length) {
    for (const node of pendingNodes) {
      if (inEdgesPlaced(node, currentRow, nodeRowMap, fa)) {
        nodeRowMap.set(node, currentRow);
        const outTargetNodes = getOutTargetNodes(node, fa);
        addToPending(outTargetNodes, pendingNodes);
        pendingNodes.delete(node);

        (grid[currentRow] ??= []).push(node);
      }
      // No else: a node whose in-edges are not all placed stays in
      // pendingNodes and is reconsidered on a later row.
    }
    currentRow++;
    if (currentRow > 200) break; // just a safety value to stop things going forever while in alpha
  }
  return grid;
}

export function getOutTargetNodes(node: string, fa: FlowAnalysis): string[] {
  const outTargetNodes: string[] = [];
  if (fa.outEdges[node]?.length > 0) {
    for (const edge of fa.outEdges[node]) {
      outTargetNodes.push(edge.endStepId);
    }
  }
  return outTargetNodes;
}

export function addToPending(nodes: string[], pending: Set<string>) {
  for (const node of nodes) {
    pending.add(node);
  }
}

export function inEdgesPlaced(
  node: string,
  row: number,
  nodeRowMap: Map<string, number>,
  fa: FlowAnalysis,
) {
  for (const edge of fa.inEdges[node]) {
    const startStepNodeRow = nodeRowMap.get(edge.startStepId);
    if (row === startStepNodeRow) return false;
  }
  return true;
}
