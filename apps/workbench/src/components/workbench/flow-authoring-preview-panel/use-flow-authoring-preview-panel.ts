import { useMemo, useState } from "react";
import { useAppSelector } from "@/redux/typed-hooks";
import { selectFlowAuthoringPanelState } from "@/redux/slices/flow-authoring-panels-slice";
import { useFlowDraftSnapshot } from "@/components/workbench/shared/flow-graph/use-flow-draft-analysis";
import {
  computeDagreLayout,
  type LayoutDirection,
} from "@/lib/flow-graph-layout";
import { FLOW_AUTHORING_ID } from "@/components/workbench/dock/dock-panels";
import type { SidePanelTab } from "@/components/workbench/shared/flow-graph/SidePanel";

// Reads the flow-authoring editor's own draft content by its fixed
// singleton id -- this panel never writes it, only displays it.
export function useFlowAuthoringPreviewPanel() {
  const { content } = useAppSelector((state) =>
    selectFlowAuthoringPanelState(state, FLOW_AUTHORING_ID),
  );
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>("TB");
  const { parseError, snapshot, isEmptySnapshot } = useFlowDraftSnapshot(
    content,
    layoutDirection,
  );

  // Recomputed from the frozen snapshot independent of parseError --
  // computeDagreLayout is the only direction-dependent step in the whole
  // analysis pipeline (analyzeFlow/analyzeRefs/toposort don't care about
  // direction at all), so a layout-orientation toggle can always apply to
  // whatever's currently displayed, even while current content is broken
  // and the snapshot itself is frozen. Without this, toggling direction
  // while the snapshot can't advance would have nowhere to write to.
  const displayLayout = useMemo(
    () =>
      computeDagreLayout(
        snapshot.flowAnalysis.flowAnalysis,
        layoutDirection,
        snapshot.flowDef,
      ),
    [snapshot, layoutDirection],
  );

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab | null>(null);

  function handleNodeClick(node: { id: string }) {
    setSelectedStepId(node.id);
    setSidePanelTab("stepdetails");
  }

  return {
    content,
    parseError,
    snapshot,
    displayLayout,
    isEmptySnapshot,
    selectedStepId,
    sidePanelTab,
    layoutDirection,
    handleNodeClick,
    handleSelectSidePanelTab: setSidePanelTab,
    handleSetLayoutDirection: setLayoutDirection,
  };
}
