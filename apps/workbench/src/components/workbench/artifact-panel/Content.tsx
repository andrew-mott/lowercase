import { ArtifactContentPanel } from "@/components/workbench/artifact-panel/ArtifactContentPanel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Rail } from "./Rail";
import { SidePanel } from "./SidePanel";
import { MetadataTab } from "./side-panel/MetadataTab";
import { useArtifactPanel } from "./use-artifact-panel";

export function Content({
  hash,
  versionId,
  panelId,
}: {
  hash: string;
  versionId: string;
  panelId: string;
}) {
  const {
    showLoading,
    hasError,
    refetch,
    item,
    compatibleParams,
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
  } = useArtifactPanel(hash, versionId, panelId);

  const viewer = <ArtifactContentPanel hash={hash} />;

  if (showLoading) return <div className="p-4">Loading artifact...</div>;
  if (hasError)
    return (
      <div className="p-4 text-sm text-destructive">
        Couldn't load the artifact.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );

  if (!sidePanelTab) {
    return (
      <div className="flex h-full">
        <div className="flex-1 min-w-0">{viewer}</div>
        <Rail activeTab={sidePanelTab} onSelectTab={handleSelectSidePanelTab} />
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="70%" className="min-w-0">
        {viewer}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="30%" minSize="15%">
        <div className="flex h-full">
          <Rail
            activeTab={sidePanelTab}
            onSelectTab={handleSelectSidePanelTab}
          />
          <div className="flex-1 min-w-0">
            <SidePanel
              activeTab={sidePanelTab}
              onClose={() => handleSelectSidePanelTab(null)}
            >
              {item ? (
                <MetadataTab
                  item={item}
                  compatibleParams={compatibleParams}
                  draft={draft}
                  isEditing={isEditing}
                  isSaving={isSaving}
                  saveError={saveError}
                  onEdit={handleEdit}
                  onCancel={handleCancel}
                  onSave={handleSave}
                  onLabelChange={handleLabelChange}
                  onShareChange={handleShareChange}
                  onToggleParam={handleToggleParam}
                />
              ) : (
                <div className="p-1 text-sm text-muted-foreground">
                  Artifact metadata not found
                </div>
              )}
            </SidePanel>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
