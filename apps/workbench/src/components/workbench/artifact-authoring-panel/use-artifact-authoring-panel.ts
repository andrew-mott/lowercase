import { useEffect, useRef, useState } from "react";
import type { ArtifactUpdateMetadata } from "@lcase/types";
import { isArtifactCompatible } from "@lcase/flow-analysis";
import { useGetFlowVersionDefQuery } from "@/redux/api/flows-api";
import {
  artifactsApi,
  useCreateArtifactMutation,
} from "@/redux/api/artifacts-api";
import { useAppDispatch, useAppSelector } from "@/redux/typed-hooks";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import { openOrFocusPanel } from "@/components/workbench/dock/dock-panels";
import { titleFor } from "@/components/workbench/shared/artifact-title";
import {
  selectArtifactAuthoringPanelState,
  setAuthoringContent,
  setAuthoringContentType,
  setAuthoringLabel,
  setAuthoringShare,
  toggleAuthoringParam,
} from "@/redux/slices/artifact-authoring-panels-slice";
import { paramHashSet } from "@/redux/slices/flow-graph-panels-slice";
import { toast } from "sonner";

// All the data-fetching, Redux read/write, and derived state the artifact
// authoring panel needs -- mirrors use-artifact-panel.ts's split. Always the
// text-authoring path (file upload never opens a panel -- it stays in
// CreateArtifactDialog.tsx), so there's no file/text kind to branch on here,
// unlike old mode's ArtifactAuthoringDraft.
export function useArtifactAuthoringPanel(
  versionId: string,
  panelId: string,
  onClose: () => void,
  returnTo?: { panelId: string; paramName: string },
) {
  const dispatch = useAppDispatch();
  const dockviewApi = useDockviewApi();
  const { content, contentType, label, share, curatedParamNames } =
    useAppSelector((state) =>
      selectArtifactAuthoringPanelState(state, panelId),
    );
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    data: versionData,
    isLoading,
    error,
  } = useGetFlowVersionDefQuery(versionId);
  const flowDef = versionData?.ok ? versionData.value.definition : null;
  const version = versionData?.ok ? versionData.value.version : null;
  const returnToParamDef = returnTo
    ? flowDef?.params?.[returnTo.paramName]
    : undefined;

  // Applies returnTo's param whenever it changes to a genuinely different
  // target -- pre-checks it in curation and derives contentType from its
  // declared type (so the created artifact is actually compatible with it
  // by construction, rather than defaulting to JSON and failing server-side
  // validation). Needed as an effect, not just at first render, because
  // refocusing an already-open singleton panel (this one, per version)
  // doesn't get a natural open/close transition to reset against, unlike
  // CreateArtifactDialog's prevOpen-tracked reset -- and flowDef itself
  // arrives async, so returnToParamDef isn't available on the very first
  // render anyway.
  const lastAppliedReturnTo = useRef<string | null>(null);
  useEffect(() => {
    if (!returnTo || !returnToParamDef) return;
    const key = `${returnTo.panelId}:${returnTo.paramName}`;
    if (lastAppliedReturnTo.current === key) return;
    lastAppliedReturnTo.current = key;
    if (!curatedParamNames.includes(returnTo.paramName)) {
      dispatch(
        toggleAuthoringParam({
          panelId,
          paramName: returnTo.paramName,
          checked: true,
        }),
      );
    }
    dispatch(
      setAuthoringContentType({ panelId, contentType: returnToParamDef.type }),
    );
  }, [returnTo, returnToParamDef, curatedParamNames, panelId, dispatch]);

  const [createArtifact, { isLoading: isSaving }] = useCreateArtifactMutation();

  const hasError = !!error || (versionData !== undefined && !versionData.ok);

  const compatibleParams = flowDef
    ? Object.fromEntries(
        Object.entries(flowDef.params ?? {}).filter(([, def]) =>
          isArtifactCompatible(contentType, def.type),
        ),
      )
    : undefined;

  function handleContentChange(value: string) {
    dispatch(setAuthoringContent({ panelId, content: value }));
  }
  function handleContentTypeChange(value: string) {
    dispatch(
      setAuthoringContentType({
        panelId,
        contentType: value as typeof contentType,
      }),
    );
  }
  function handleLabelChange(value: string) {
    dispatch(setAuthoringLabel({ panelId, label: value }));
  }
  function handleShareChange(value: boolean) {
    dispatch(setAuthoringShare({ panelId, share: value }));
  }
  function handleToggleParam(paramName: string, checked: boolean) {
    dispatch(toggleAuthoringParam({ panelId, paramName, checked }));
  }

  function handleCancel() {
    onClose();
  }

  async function handleSave() {
    if (!version) return;
    if (content.trim().length === 0) {
      setSaveError("Error saving: content must contain more than whitespace.");
      toast.error("Error saving: content must contain more than whitespace.", {
        position: "top-center",
      });
      return;
    }
    if (label.trim().length === 0) {
      setSaveError("Error saving: label must contain more than whitespace.");
      toast.error("Error saving: label must contain more than whitespace.", {
        position: "top-center",
      });
      return;
    }
    // fast local feedback only -- value is always sent as the raw string
    // regardless (the server parses it when contentType implies json,
    // matching ArtifactAuthorTextPanel.handleSave's same contract)
    if (contentType === "application/json") {
      try {
        JSON.parse(content);
      } catch {
        setSaveError("Error saving: content is not valid JSON.");
        toast.error("Error saving: content is not valid JSON.", {
          position: "top-center",
        });
        return;
      }
    }

    setSaveError(null);
    // Filtered here, not pruned as curatedParamNames changes -- switching
    // content type away and back should leave a previously-checked param
    // still checked, so only what's *currently* compatible (the same set
    // CuratedParamsField is already rendering checkboxes for) gets sent,
    // rather than mutating the underlying selection on every content-type
    // change.
    const validCuratedParamNames = curatedParamNames.filter(
      (name) => compatibleParams && name in compatibleParams,
    );
    const metadata: ArtifactUpdateMetadata = {
      label: label.trim() ? label.trim() : null,
      flowId: share ? version.flowId : null,
      flowVersionId: versionId,
      paramCurations: validCuratedParamNames,
    };
    try {
      const result = await createArtifact({
        kind: "authored",
        contentType,
        value: content,
        metadata,
      }).unwrap();
      if (result.ok) {
        const associations = {
          flowId: metadata.flowId ?? undefined,
          flowVersionId: versionId,
          curated: true,
          paramCurations: validCuratedParamNames.map((paramName) => ({
            flowVersionId: versionId,
            paramName,
          })),
        };
        dispatch(
          artifactsApi.util.updateQueryData(
            "listArtifacts",
            { flowVersionId: versionId, curated: "true" },
            (list) => {
              if (!list.ok) return;
              list.value.push({ artifact: result.value, associations });
            },
          ),
        );
        if (dockviewApi) {
          openOrFocusPanel(dockviewApi, {
            kind: "artifact",
            label: titleFor({ artifact: result.value, associations }),
            hash: result.value.hash,
            versionId,
          });
        }
        if (
          returnTo &&
          returnToParamDef &&
          isArtifactCompatible(result.value.contentType, returnToParamDef.type)
        ) {
          dispatch(
            paramHashSet({
              panelId: returnTo.panelId,
              name: returnTo.paramName,
              hash: result.value.hash,
            }),
          );
        }
        toast.success(
          `Created artifact "${titleFor({ artifact: result.value, associations })}"`,
        );
        onClose();
      } else {
        setSaveError(result.error);
        toast.error(result.error, { position: "top-center" });
      }
    } catch {
      setSaveError("Failed to create artifact. Please try again.");
      toast.error("Failed to create artifact. Please try again.", {
        position: "top-center",
      });
    }
  }

  return {
    isLoading,
    hasError,
    content,
    contentType,
    label,
    share,
    curatedParamNames,
    compatibleParams,
    isSaving,
    saveError,
    handleContentChange,
    handleContentTypeChange,
    handleLabelChange,
    handleShareChange,
    handleToggleParam,
    handleCancel,
    handleSave,
  };
}
