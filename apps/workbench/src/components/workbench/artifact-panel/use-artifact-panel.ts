import { useState } from "react";
import type {
  ArtifactIndex,
  ArtifactListItem,
  ArtifactUpdateMetadata,
  GetArtifactsReq,
} from "@lcase/types";
import { isArtifactCompatible } from "@lcase/flow-analysis";
import { useGetFlowVersionDefQuery } from "@/redux/api/flows-api";
import {
  artifactsApi,
  useListArtifactsQuery,
  useUpdateArtifactMetadataMutation,
} from "@/redux/api/artifacts-api";
import { useAppDispatch, useAppSelector } from "@/redux/typed-hooks";
import type { AppDispatch } from "@/redux/store";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import {
  artifactMetadataSaved,
  cancelEditingArtifactMetadata,
  selectArtifactPanelState,
  setDraftShare,
  sidePanelTabSet,
  startEditingArtifactMetadata,
  toggleDraftParam,
  updateDraftLabel,
  type ArtifactSidePanelTab,
} from "@/redux/slices/artifact-panels-slice";

// Updates a hash's entry in a cached listArtifacts result if present, else
// inserts one -- needed because a save can make an artifact newly belong to
// a `curated: "true"`-scoped cache entry it wasn't in before (see
// handleSave below for why this gets called for two different cache keys).
function patchArtifactCache(
  dispatch: AppDispatch,
  args: GetArtifactsReq,
  hash: string,
  artifact: ArtifactIndex,
  associations: ArtifactListItem["associations"],
) {
  dispatch(
    artifactsApi.util.updateQueryData("listArtifacts", args, (list) => {
      if (!list.ok) return;
      const existing = list.value.find((i) => i.artifact.hash === hash);
      if (existing) {
        existing.artifact = artifact;
        existing.associations = associations;
      } else {
        list.value.push({ artifact, associations });
      }
    }),
  );
}

// All the data-fetching, Redux read/write, and derived state the artifact
// panel needs -- Content.tsx composes JSX from this, mirroring
// use-flow-graph-panel.ts's split. versionId is the metadata query's scope
// (see explorer-panels.ts's artifact variant), not this panel's identity.
export function useArtifactPanel(
  hash: string,
  versionId: string,
  panelId: string,
) {
  const dispatch = useAppDispatch();
  const { sidePanelTab, draft, isEditing } = useAppSelector((state) =>
    selectArtifactPanelState(state, panelId),
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    data: versionData,
    isLoading: isVersionLoading,
    error: versionError,
    refetch,
  } = useGetFlowVersionDefQuery(versionId);
  const flowDef = versionData?.ok ? versionData.value.definition : null;
  const version = versionData?.ok ? versionData.value.version : null;

  // `hash` finds this exact artifact regardless of its own flowVersionId/
  // curated columns -- a step's run output/export never gets those set at
  // all (the worker writes it with no metadata), so filtering by
  // flowVersionId alone, curated or not, can never find it. flowVersionId
  // is still passed alongside -- not for row-selection (hash already
  // pins that down), but to scope which paramCurations come back attached,
  // so Edit still pre-checks the right boxes for this version. The
  // curated-scoped list other components rely on (the params picker,
  // FlowExplorer's artifact list) is a *different* cache entry; see
  // patchArtifactCache below for why handleSave patches both.
  const { data: artifactsData, isLoading: isArtifactsLoading } =
    useListArtifactsQuery({ hash, flowVersionId: versionId });

  const [updateMetadata, { isLoading: isSaving }] =
    useUpdateArtifactMetadataMutation();

  const showLoading = useDelayedLoading(isVersionLoading || isArtifactsLoading);
  const hasError =
    !!versionError ||
    (versionData !== undefined && !versionData.ok) ||
    (artifactsData !== undefined && !artifactsData.ok);

  const item = artifactsData?.ok
    ? artifactsData.value.find((i) => i.artifact.hash === hash)
    : undefined;

  const savedCuratedParamNames =
    item?.associations.paramCurations.map((pc) => pc.paramName) ?? [];

  /**
   * only offer params whose declared content type actually matches this
   * artifact -- same check run.service.ts uses to validate a run's param
   * artifacts; the server enforces this too, so this is UX, not the only guard
   */
  const compatibleParams =
    flowDef && item
      ? Object.fromEntries(
          Object.entries(flowDef.params ?? {}).filter(([, def]) =>
            isArtifactCompatible(item.artifact.contentType, def.type),
          ),
        )
      : undefined;

  const handleSelectSidePanelTab = (tab: ArtifactSidePanelTab | null) => {
    dispatch(sidePanelTabSet({ panelId, tab }));
  };

  function handleEdit() {
    if (!item) return;
    setSaveError(null);
    dispatch(
      startEditingArtifactMetadata({
        panelId,
        draft: {
          label: item.artifact.label ?? "",
          share: !!item.associations.flowId,
          curatedParamNames: savedCuratedParamNames,
        },
      }),
    );
  }

  function handleCancel() {
    setSaveError(null);
    dispatch(cancelEditingArtifactMetadata({ panelId }));
  }

  async function handleSave() {
    if (!draft || !version) return;
    setSaveError(null);
    const metadata: ArtifactUpdateMetadata = {
      label: draft.label.trim() ? draft.label.trim() : null,
      flowId: draft.share ? version.flowId : null,
      flowVersionId: versionId,
      paramCurations: draft.curatedParamNames,
    };
    try {
      const result = await updateMetadata({ hash, metadata }).unwrap();
      if (result.ok) {
        const associations: ArtifactListItem["associations"] = {
          flowId: metadata.flowId ?? undefined,
          flowVersionId: versionId,
          // updateArtifactMetadata always sets curated: true server-side
          // (prisma-artifact-repository.ts), regardless of whether
          // paramCurations is empty -- curation is one-way, so this is
          // never wrong to assume here.
          curated: true,
          paramCurations: draft.curatedParamNames.map((paramName) => ({
            flowVersionId: versionId,
            paramName,
          })),
        };
        // Patches two cache entries, not one -- this panel's own hash-scoped
        // lookup (above) and the curated-scoped list other components rely
        // on (the params picker's candidates, FlowExplorer's artifact list)
        // are different cache entries. Both need the optimistic update; the
        // curated-scoped one especially, since a first-time curation won't
        // already have an entry there to find.
        patchArtifactCache(
          dispatch,
          { hash, flowVersionId: versionId },
          hash,
          result.value,
          associations,
        );
        patchArtifactCache(
          dispatch,
          { flowVersionId: versionId, curated: "true" },
          hash,
          result.value,
          associations,
        );
        dispatch(artifactMetadataSaved({ panelId }));
      } else {
        setSaveError(result.error);
      }
    } catch {
      setSaveError("Failed to save artifact metadata. Please try again.");
    }
  }

  function handleLabelChange(label: string) {
    dispatch(updateDraftLabel({ panelId, label }));
  }
  function handleShareChange(share: boolean) {
    dispatch(setDraftShare({ panelId, share }));
  }
  function handleToggleParam(paramName: string, checked: boolean) {
    dispatch(toggleDraftParam({ panelId, paramName, checked }));
  }

  return {
    showLoading,
    hasError,
    refetch,
    item,
    compatibleParams,
    savedCuratedParamNames,
    sidePanelTab,
    draft,
    isEditing,
    isSaving,
    saveError,
    handleSelectSidePanelTab,
    handleEdit,
    handleCancel,
    handleSave,
    handleLabelChange,
    handleShareChange,
    handleToggleParam,
  };
}
