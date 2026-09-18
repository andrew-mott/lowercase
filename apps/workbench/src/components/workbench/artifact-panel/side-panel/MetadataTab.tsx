import type { ArtifactListItem, FlowParamDefinition } from "@lcase/types";
import { formatBytes } from "@/components/workbench/shared/format-bytes";
import { Button } from "@/components/ui/button";
import { IdentityField } from "@/components/workbench/shared/fields/IdentityField";
import { InputField } from "@/components/workbench/shared/fields/InputField";
import { SwitchField } from "@/components/workbench/shared/fields/SwitchField";
import { CuratedParamsField } from "@/components/workbench/shared/fields/CuratedParamsField";
import { CheckIcon, PenLineIcon, XIcon } from "lucide-react";
import type { ArtifactMetadataDraft } from "@/redux/slices/artifact-panels-slice";

// Presentational only -- no hooks/dispatch of its own, everything comes
// from use-artifact-panel.ts via Content.tsx, matching how
// flow-graph-panel's side-panel tabs (e.g. SettingsTab.tsx) are fed. JSX
// ported from the old mode's ArtifactMetadataPanel.tsx; its Redux
// draft/isEditing plumbing did not carry over -- see the related change in
// docs/initiatives/ui-workspace/INITIATIVE.md for why.
export function MetadataTab({
  item,
  compatibleParams,
  draft,
  isEditing,
  isSaving,
  saveError,
  onEdit,
  onCancel,
  onSave,
  onLabelChange,
  onShareChange,
  onToggleParam,
}: {
  item: ArtifactListItem;
  compatibleParams?: Record<string, FlowParamDefinition>;
  draft: ArtifactMetadataDraft | null;
  isEditing: boolean;
  isSaving: boolean;
  saveError: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onLabelChange: (label: string) => void;
  onShareChange: (share: boolean) => void;
  onToggleParam: (paramName: string, checked: boolean) => void;
}) {
  const { artifact, associations } = item;
  const savedCuratedParamNames = associations.paramCurations.map(
    (pc) => pc.paramName,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col gap-2">
        <IdentityField label="Hash" value={artifact.hash} />
        <IdentityField
          label="Time"
          value={new Date(artifact.time).toLocaleString()}
        />
        <IdentityField label="Content Type" value={artifact.contentType} />
        <IdentityField
          label="Size"
          value={
            artifact.size !== undefined ? formatBytes(artifact.size) : undefined
          }
        />
        <IdentityField label="Format" value={artifact.format} />

        <InputField
          label="Label"
          value={draft ? draft.label : (artifact.label ?? "")}
          onChange={isEditing ? onLabelChange : undefined}
        />

        <SwitchField
          label="Share"
          value={draft ? draft.share : !!associations.flowId}
          onChange={isEditing ? onShareChange : undefined}
        />
        <CuratedParamsField
          label="Params"
          params={compatibleParams}
          curatedParamNames={
            draft ? draft.curatedParamNames : savedCuratedParamNames
          }
          onToggleParam={isEditing ? onToggleParam : undefined}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-4">
        {saveError && (
          <p className="text-xs text-destructive mr-auto">{saveError}</p>
        )}
        {isEditing ? (
          <>
            <Button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="cursor-pointer text-neutral-900 bg-rose-300 hover:bg-rose-200 dark:bg-rose-800 dark:hover:bg-rose-600 dark:text-neutral-50"
            >
              <XIcon /> Cancel
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="cursor-pointer text-neutral-900 bg-emerald-300 hover:bg-emerald-200 dark:bg-emerald-800 dark:hover:bg-emerald-600 dark:text-neutral-50"
            >
              <CheckIcon /> Save
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={onEdit}
            className="cursor-pointer text-neutral-900 bg-sky-300 hover:bg-sky-200 dark:bg-sky-800 dark:hover:bg-sky-600 dark:text-neutral-50"
          >
            <PenLineIcon /> Edit
          </Button>
        )}
      </div>
    </div>
  );
}
