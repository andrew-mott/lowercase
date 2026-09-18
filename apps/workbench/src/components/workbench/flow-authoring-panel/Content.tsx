import { CheckIcon, CircleAlertIcon, VariableIcon, XIcon } from "lucide-react";
import { CodeEditor } from "@/components/workbench/shared/CodeEditor";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { cn } from "@/lib/utils";
import {
  FLOW_AUTHORING_ICON_CLASS,
  FLOW_GRAPH_ICON,
} from "@/components/workbench/shared/tab-icons";
import {
  Rail,
  type RailItem,
} from "@/components/workbench/shared/flow-graph/Rail";
import {
  SidePanel,
  type SidePanelTab,
} from "@/components/workbench/shared/flow-graph/SidePanel";
import { ProblemsTab } from "@/components/workbench/shared/flow-graph/side-panel/ProblemsTab";
import { ParametersTab } from "@/components/workbench/shared/flow-graph/side-panel/ParametersTab";
import { useFlowAuthoringPanel } from "./use-flow-authoring-panel";

// Only Problems and Parameters -- both pure flowDef-derived, no interaction
// needed. Unlike the preview panel, there's no graph here to click a node
// on, so Step Details (which needs a selected step) doesn't have a way in.
const RAIL_ITEMS: RailItem[] = [
  { tab: "parameters", label: "Parameters", icon: VariableIcon },
  { tab: "problems", label: "Problems", icon: CircleAlertIcon },
];

export function Content({
  panelId,
  onClose,
}: {
  panelId: string;
  onClose: () => void;
}) {
  const {
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
    handleSelectSidePanelTab,
  } = useFlowAuthoringPanel(panelId, onClose);

  const debouncedContentChange = useDebouncedCallback(handleContentChange, 250);

  // Same reasoning as the preview panel's own parseError handling: a
  // pristine, untouched draft shouldn't greet the user with an error, and
  // saveError/parseError share this one slot rather than each getting their
  // own separate display -- "a consistent place for these errors."
  const showParseError = parseError !== null && content.trim() !== "";
  const problemsCount =
    problems.length + (showParseError ? 1 : 0) + (saveError ? 1 : 0);
  const problemsBadgeVariant =
    saveError || showParseError ? "error" : "default";

  const renderSidePanelTab = (tab: SidePanelTab) => {
    switch (tab) {
      case "problems":
        return (
          <>
            {saveError && (
              <p className="mb-2 text-xs text-error-foreground">{saveError}</p>
            )}
            {showParseError && (
              <p className="mb-2 text-xs text-error-foreground">
                {isEmptySnapshot
                  ? "Nothing valid yet -- "
                  : "Showing problems from the last valid version -- current edits don't parse: "}
                {parseError}
              </p>
            )}
            {(!(saveError || showParseError) || problems.length > 0) && (
              <ProblemsTab problems={problems} />
            )}
          </>
        );
      case "parameters":
        return <ParametersTab params={snapshot.flowDef.params ?? {}} />;
      default:
        return null;
    }
  };

  const editor = (
    <CodeEditor
      height="100%"
      value={content}
      language="json"
      onChange={debouncedContentChange}
    />
  );

  const header = (
    <div
      className="flex items-center justify-between shrink-0 mr-2
    mb-2"
    >
      <h3 className="font-medium">New Flow</h3>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleOpenPreview}
          size="xs"
          className="cursor-pointer"
        >
          <FLOW_GRAPH_ICON
            className={cn(FLOW_AUTHORING_ICON_CLASS, "size-4")}
          />
          Preview
        </Button>
        <Button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          size="xs"
          className="cursor-pointer text-neutral-900 bg-rose-300 hover:bg-rose-200 dark:bg-rose-800 dark:hover:bg-rose-600 dark:text-neutral-50"
        >
          <XIcon />
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="cursor-pointer text-neutral-900 bg-emerald-300 hover:bg-emerald-200 dark:bg-emerald-800 dark:hover:bg-emerald-600 dark:text-neutral-50"
        >
          <CheckIcon />
          Save
        </Button>
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="min-h-0 flex-1">
        {!sidePanelTab ? (
          <div className="flex h-full">
            <div className="flex-1 min-w-0 flex h-full min-h-0 flex-col">
              {header}
              <div className="flex-1 min-h-0">{editor}</div>
            </div>
            <Rail
              activeTab={sidePanelTab}
              onSelectTab={handleSelectSidePanelTab}
              problemsCount={problemsCount}
              problemsBadgeVariant={problemsBadgeVariant}
              items={RAIL_ITEMS}
            />
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel
              defaultSize="70%"
              className="flex h-full min-h-0 flex-col"
              style={{ overflow: "hidden" }}
            >
              {header}
              <div className="flex-1 min-h-0">{editor}</div>
            </ResizablePanel>
            <ResizableHandle className="bg-dock-panel-border" />
            <ResizablePanel defaultSize="30%" minSize="15%">
              <div className="flex h-full border-t border-t-dock-panel-border">
                <Rail
                  activeTab={sidePanelTab}
                  onSelectTab={handleSelectSidePanelTab}
                  problemsCount={problemsCount}
                  problemsBadgeVariant={problemsBadgeVariant}
                  items={RAIL_ITEMS}
                />
                <div className="flex-1 min-w-0">
                  <SidePanel
                    activeTab={sidePanelTab}
                    onClose={() => handleSelectSidePanelTab(null)}
                  >
                    {renderSidePanelTab(sidePanelTab)}
                  </SidePanel>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
