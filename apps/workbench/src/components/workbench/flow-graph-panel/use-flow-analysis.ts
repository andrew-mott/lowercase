import { useMemo } from "react";
import { analyzeFlow, analyzeRefs, toposort } from "@lcase/flow-analysis";
import type { FlowDefinition } from "@lcase/types";
import {
  computeDagreLayout,
  type LayoutDirection,
} from "@/lib/flow-graph-layout";

export function useFlowAnalysis(
  flowDef: FlowDefinition | null,
  direction: LayoutDirection = "TB",
) {
  return useMemo(() => {
    if (!flowDef) return null;

    let fa = analyzeFlow(flowDef);
    fa = analyzeRefs(flowDef, fa);
    fa.toposort = toposort(fa);

    return {
      flowAnalysis: fa,
      layout: computeDagreLayout(fa, direction, flowDef),
    };
  }, [flowDef, direction]);
}
