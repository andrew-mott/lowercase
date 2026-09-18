import { useState } from "react";
import { useAddJsonFlowMutation, flowsApi } from "@/redux/api/flows-api";
import { useAppDispatch, useAppSelector } from "@/redux/typed-hooks";
import {
  selectFlowAuthoringPanelState,
  setFlowAuthoringContent,
} from "@/redux/slices/flow-authoring-panels-slice";
import { useFlowDraftSnapshot } from "@/components/workbench/shared/flow-graph/use-flow-draft-analysis";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import {
  FLOW_AUTHORING_PREVIEW_ID,
  openOrFocusPanel,
} from "@/components/workbench/dock/dock-panels";
import type { SidePanelTab } from "@/components/workbench/shared/flow-graph/SidePanel";
import { toast } from "sonner";

// All the data-fetching, Redux read/write, and derived state the
// flow-authoring editor panel needs -- mirrors use-artifact-authoring-panel's
// split, but with no metadata sidebar: FlowSchema already carries
// name/description/kind as part of the JSON itself, so there's nothing else
// to collect.
export function useFlowAuthoringPanel(panelId: string, onClose: () => void) {
  const dispatch = useAppDispatch();
  const dockviewApi = useDockviewApi();
  const { content } = useAppSelector((state) =>
    selectFlowAuthoringPanelState(state, panelId),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab | null>(null);

  // Same "last good" snapshot the preview panel uses, so the Problems tab
  // here doesn't lose sight of the last valid version's real analyzeFlow
  // problems just because current content momentarily doesn't parse --
  // matches the preview panel's own behavior instead of going blank.
  // canSave/handleSave read straight off parseError+snapshot rather than a
  // separate live flowDef/problems pair: whenever parseError is null (the
  // only case canSave can be true), the snapshot has, by construction,
  // already caught up to the current content in this same render pass --
  // useFlowDraftSnapshot's own render-time advance guard guarantees that
  // before this component ever actually commits.
  const { parseError, snapshot, isEmptySnapshot } =
    useFlowDraftSnapshot(content);
  const problems = snapshot.flowAnalysis.flowAnalysis.problems;
  const canSave = parseError === null && problems.length === 0;

  const [addJsonFlow, { isLoading: isSaving }] = useAddJsonFlowMutation();

  function handleContentChange(value: string) {
    dispatch(setFlowAuthoringContent({ panelId, content: value }));
  }

  function handleCancel() {
    dockviewApi?.getPanel(FLOW_AUTHORING_PREVIEW_ID)?.api.close();
    onClose();
  }

  // Not auto-opened alongside the editor -- the preview only launches when
  // asked for, mirroring how EventGraph opens from a Flow Graph panel's own
  // toolbar button rather than automatically. Same positioning mechanism
  // too, direction "right" instead of "below".
  function handleOpenPreview() {
    if (!dockviewApi) return;
    openOrFocusPanel(
      dockviewApi,
      { kind: "flow-authoring-preview", label: "New Flow Preview" },
      { position: { direction: "right", referencePanel: panelId } },
    );
  }

  async function handleSave() {
    if (!canSave) return;
    setSaveError(null);
    try {
      const result = await addJsonFlow({ body: snapshot.flowDef }).unwrap();
      if (result.ok) {
        dispatch(
          flowsApi.util.updateQueryData("getFlows", undefined, (list) => {
            if (!list.ok) return;
            // Server orders flows createdAt desc (newest first,
            // prisma-flow-repository.ts's listFlowsWithLatestVersion) --
            // unshift to match, not push, so a fresh save lands at the top
            // of the tree immediately instead of the bottom.
            list.value.unshift({
              flow: result.value.flow,
              latestVersion: result.value.version,
            });
          }),
        );
        if (dockviewApi) {
          openOrFocusPanel(dockviewApi, {
            kind: "flow-graph",
            label: result.value.flow.name,
            versionId: result.value.version.id,
            openedAs: { type: "plain" },
          });
        }
        toast.success(`Created flow "${result.value.flow.name}"`);
        dockviewApi?.getPanel(FLOW_AUTHORING_PREVIEW_ID)?.api.close();
        onClose();
      } else {
        setSaveError(result.error);
        toast.error(result.error, { position: "top-center" });
      }
    } catch {
      setSaveError("Failed to create flow. Please try again.");
      toast.error("Failed to create flow. Please try again.", {
        position: "top-center",
      });
    }
  }

  return {
    content,
    snapshot,
    parseError,
    isEmptySnapshot,
    problems,
    canSave,
    isSaving,
    saveError,
    sidePanelTab,
    handleContentChange,
    handleCancel,
    handleSave,
    handleOpenPreview,
    handleSelectSidePanelTab: setSidePanelTab,
  };
}
