import { CodeEditor } from "@/components/workbench/shared/CodeEditor";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/workbench/shared/fields/InputField";
import { SwitchField } from "@/components/workbench/shared/fields/SwitchField";
import { CuratedParamsField } from "@/components/workbench/shared/fields/CuratedParamsField";
import { SelectField } from "@/components/workbench/shared/fields/SelectField";
import { artifactFormatToLanguage } from "@/components/workbench/shared/ref-resolution";
import { detectAuthoredFormat } from "@/components/workbench/artifact-authoring-panel/detect-authored-format";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { CheckIcon, XIcon } from "lucide-react";
import { useArtifactAuthoringPanel } from "./use-artifact-authoring-panel";

const CONTENT_TYPE_OPTIONS = [
  { value: "application/json", label: "JSON" },
  { value: "text/markdown", label: "Markdown" },
  { value: "text/plain", label: "Plain Text" },
];

// Fixed two-section layout, deliberately not a resizable
// ResizablePanelGroup and no Rail (see the related change in
// docs/initiatives/ui-workspace/INITIATIVE.md) -- there's no view/edit toggle to switch
// between here, so the Rail's whole reason to exist doesn't apply.
export function Content({
  versionId,
  panelId,
  onClose,
  returnTo,
}: {
  versionId: string;
  panelId: string;
  onClose: () => void;
  returnTo?: { panelId: string; paramName: string };
}) {
  const {
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
  } = useArtifactAuthoringPanel(versionId, panelId, onClose, returnTo);

  const debouncedContentChange = useDebouncedCallback(handleContentChange, 250);

  if (isLoading) return <div className="p-4">Loading...</div>;
  if (hasError)
    return (
      <div className="p-4 text-sm text-destructive">
        Couldn't load this flow version.
      </div>
    );

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 flex flex-col gap-4 min-h-0">
        <h3 className="font-medium shrink-0 mt-3 ml-3">New Artifact</h3>
        <div className="flex-1 min-h-0">
          <CodeEditor
            height="100%"
            value={content}
            language={artifactFormatToLanguage(
              detectAuthoredFormat(contentType),
            )}
            onChange={debouncedContentChange}
          />
        </div>
      </div>
      <div className="w-80 shrink-0 flex flex-col gap-4 p-4 overflow-y-auto border-l border-dock-panel-border dark:border-dock-panel-border">
        <div className="flex-1 flex flex-col gap-4">
          <SelectField
            label="Content Type"
            value={contentType}
            options={CONTENT_TYPE_OPTIONS}
            // Locked while returnTo is set: the type is already derived
            // from the target param's declared type (see
            // use-artifact-authoring-panel.ts), and SelectField disables
            // itself whenever no onChange is passed.
            onChange={returnTo ? undefined : handleContentTypeChange}
          />
          <InputField
            label="Label"
            value={label}
            onChange={handleLabelChange}
          />
          <SwitchField
            label="Share"
            value={share}
            onChange={handleShareChange}
          />
          <CuratedParamsField
            label="Params"
            params={compatibleParams}
            curatedParamNames={curatedParamNames}
            onToggleParam={handleToggleParam}
          />
        </div>
        <div className="flex items-center justify-end gap-2 shrink-0">
          {saveError && (
            <p className="text-xs text-destructive mr-auto">{saveError}</p>
          )}
          <Button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            size="sm"
            className="cursor-pointer text-neutral-900 bg-rose-300 hover:bg-rose-200 dark:bg-rose-800 dark:hover:bg-rose-600 dark:text-neutral-50"
          >
            <XIcon />
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="cursor-pointer text-neutral-900 bg-emerald-300 hover:bg-emerald-200 dark:bg-emerald-800 dark:hover:bg-emerald-600 dark:text-neutral-50"
          >
            <CheckIcon />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
