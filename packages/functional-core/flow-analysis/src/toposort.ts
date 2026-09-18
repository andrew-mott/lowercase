import type { FlowAnalysis } from "@lcase/types";
import { addProblem } from "./analyze-flow.js";
/**
 * Uses a flow analysis to generate a toposort array of node ids.
 * @param fa FlowAnalysis object
 * @returns string[] of node ids -- partial (fewer than fa.nodes.length) if a
 *   cycle prevented some nodes from being ordered; a CycleDetected problem
 *   is added to fa.problems in that case rather than throwing.
 */
export function toposort(fa: FlowAnalysis): string[] {
  const inDegreeMap = new Map<string, number>();

  const queue: string[] = [];
  for (const node of fa.nodes) {
    const inDegree = fa.inEdges[node]?.length ?? 0;
    inDegreeMap.set(node, inDegree);
    if (inDegree === 0) queue.push(node);
  }

  const toposort: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    toposort.push(node);

    if (fa.outEdges[node] === undefined) continue;

    for (const edge of fa.outEdges[node]) {
      console.log(edge);
      const currentInEdges = inDegreeMap.get(edge.endStepId)!;
      const remainingInEdges = currentInEdges - 1;
      inDegreeMap.set(edge.endStepId, remainingInEdges);
      if (remainingInEdges === 0) queue.push(edge.endStepId);
    }
  }

  if (toposort.length !== fa.nodes.length) {
    addProblem({ type: "CycleDetected" }, fa.problems);
  }
  return toposort;
}
