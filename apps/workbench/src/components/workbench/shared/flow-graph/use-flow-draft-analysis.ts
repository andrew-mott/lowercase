import { useMemo, useState } from "react";
import type { FlowDefinition } from "@lcase/types";
import { parseFlow } from "@lcase/specs";
import { analyzeFlow, analyzeRefs, toposort } from "@lcase/flow-analysis";
import {
  computeDagreLayout,
  type LayoutDirection,
} from "@/lib/flow-graph-layout";
import { useFlowAnalysis } from "@/components/workbench/flow-graph-panel/use-flow-analysis";

export type FlowDraftSnapshot = {
  flowDef: FlowDefinition;
  flowAnalysis: NonNullable<ReturnType<typeof useFlowAnalysis>>;
};

// Shared "nothing valid yet" stub for any caller that keeps a last-good
// snapshot of a draft (the flow-authoring editor and preview panels both
// do) -- rather than starting from null and needing a separate empty-state
// branch, both start from this so the graph/problems/parameters always
// have *something* structurally valid to render, even before the very
// first successful parse. Computed once, directly via the same pure
// functions useFlowAnalysis composes (that hook itself can't be called
// here -- this is a plain module-level value, not a component).
export const EMPTY_FLOW_DEF: FlowDefinition = {
  name: "",
  version: "",
  start: "",
  steps: {},
};
export const EMPTY_FLOW_DRAFT_SNAPSHOT: FlowDraftSnapshot = (() => {
  let fa = analyzeFlow(EMPTY_FLOW_DEF);
  fa = analyzeRefs(EMPTY_FLOW_DEF, fa);
  fa.toposort = toposort(fa);
  return {
    flowDef: EMPTY_FLOW_DEF,
    flowAnalysis: {
      flowAnalysis: fa,
      layout: computeDagreLayout(fa, "TB", EMPTY_FLOW_DEF),
    },
  };
})();

// Pure -- covers the first two of three distinct failure tiers: invalid
// JSON, and valid JSON that fails parseFlow's Zod schema. The third tier (a
// valid FlowDefinition that analyzeFlow finds problems in) is never a
// concern of this function -- analyzeFlow's own parameter type
// (FlowDefinition, not unknown) proves problems can only ever be computed
// once these first two have already passed, so a schema failure is never
// itself one of the FlowProblems. This app has no jsdom, so
// useFlowDraftAnalysis itself (the React-hook wrapper below) isn't
// independently unit-tested -- this pure composition is, directly.
export function parseDraftFlow(content: string):
  | { flowDef: FlowDefinition; parseError: null }
  | {
      flowDef: null;
      parseError: string;
    } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return {
      flowDef: null,
      parseError: err instanceof Error ? err.message : "Invalid JSON.",
    };
  }
  const result = parseFlow(parsed);
  if (!result.ok) return { flowDef: null, parseError: result.error };
  return { flowDef: result.value, parseError: null };
}

export function useFlowDraftAnalysis(
  content: string,
  direction: LayoutDirection = "TB",
) {
  const { flowDef, parseError } = useMemo(
    () => parseDraftFlow(content),
    [content],
  );

  const flowAnalysis = useFlowAnalysis(flowDef, direction);

  return { flowDef, parseError, flowAnalysis };
}

// Wraps useFlowDraftAnalysis with a "last good" snapshot -- both the
// flow-authoring editor and preview panels need this identically: a bad
// keystroke (invalid JSON, or valid JSON failing the schema) never blanks
// out whatever was last successfully parsed, it just stops the snapshot
// from advancing until content is valid again. Snapshot only ever updates
// on a tier-1/2 pass (schema-valid), regardless of tier-3 (analyzeFlow)
// problems -- compares flowAnalysis, not flowDef, since flowDef stays
// referentially stable across a pure layout-direction toggle (parseDraftFlow's
// own memo is keyed on content alone) while flowAnalysis is always fresh
// either way (its memo is keyed on [flowDef, direction]), so this also
// correctly advances on a direction-only change with the same content.
// Computed during render (same pattern use-tracked-flow-graph-panel.ts
// already establishes for the identical reason: comparing against a
// previous render's value and conditionally setState-ing is safe here, not
// the set-state-in-effect anti-pattern), not inside a useEffect.
export function useFlowDraftSnapshot(
  content: string,
  direction: LayoutDirection = "TB",
) {
  const { parseError, flowDef, flowAnalysis } = useFlowDraftAnalysis(
    content,
    direction,
  );

  const [snapshot, setSnapshot] = useState<FlowDraftSnapshot>(
    EMPTY_FLOW_DRAFT_SNAPSHOT,
  );
  if (
    parseError === null &&
    flowDef &&
    flowAnalysis &&
    snapshot.flowAnalysis !== flowAnalysis
  ) {
    setSnapshot({ flowDef, flowAnalysis });
  }

  return {
    parseError,
    snapshot,
    isEmptySnapshot: snapshot.flowDef === EMPTY_FLOW_DEF,
  };
}
