import { FlowGraph } from "@/components/workbench/shared/flow-graph/FlowGraph";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { RunToolbar } from "./toolbar/RunToolbar";
import { Rail } from "@/components/workbench/shared/flow-graph/Rail";
import {
  SidePanel,
  type SidePanelTab,
} from "@/components/workbench/shared/flow-graph/SidePanel";
import { SimAuthoringBar } from "./toolbar/SimAuthoringBar";
import { SaveSimDialog } from "./toolbar/SaveSimDialog";
import { RunInputTab } from "./side-panel/RunInputTab";
import { SimTab } from "./side-panel/SimTab";
import { ProblemsTab } from "@/components/workbench/shared/flow-graph/side-panel/ProblemsTab";
import { ParametersTab } from "@/components/workbench/shared/flow-graph/side-panel/ParametersTab";
import { StepDetailsTab } from "@/components/workbench/shared/flow-graph/side-panel/StepDetailsTab";
import { StepResultsTab } from "./side-panel/StepResultsTab";
import { SettingsTab } from "./side-panel/SettingsTab";
import { useFlowGraphPanel } from "./use-flow-graph-panel";

export function Content({
  versionId,
  panelId,
  simId,
  runOpened,
}: {
  versionId: string;
  panelId: string;
  simId?: string;
  runOpened?: boolean;
}) {
  const {
    showLoading,
    hasError,
    refetch,
    flowDef,
    version,
    flowAnalysis,
    artifacts,
    problems,
    params,
    missingRequiredParams,
    stepRunInfo,
    replay,
    replaySpeed,
    replayAvailable,
    handleTogglePlayPause,
    handleCancelReplay,
    handleSetReplaySpeed,
    selectedParamHashes,
    sidePanelTab,
    runId,
    selectedStepId,
    simDraft,
    activeSimDefinition,
    reusedStepIds,
    isReusedForSelectedStep,
    onToggleReuse,
    runDisabled,
    saveDialogOpen,
    setSaveDialogOpen,
    handleParamChange,
    handleNodeClick,
    handleRun,
    handleOpenEventGraph,
    handleOpenSimulate,
    handleOpenParams,
    handleSelectSidePanelTab,
    handleStartAuthoring,
    handleDraftEnded,
    layoutDirection,
    handleSetLayoutDirection,
    viewport,
    handleViewportChange,
    paramsLoading,
    paramsError,
    curatedArtifacts,
    handleOpenArtifact,
    handleRevealInDefinition,
  } = useFlowGraphPanel(versionId, panelId, simId, runOpened);

  // Below this point, nothing yet requires flowDef/version to be non-null
  // -- so while isLoading is true but hasn't crossed showLoading's delay
  // yet, this renders nothing (via the existing !flowDef/!version guards
  // further down) rather than a second, redundant early return here.
  if (showLoading) return <div className="p-4">Loading flow graph...</div>;
  if (hasError)
    return (
      <div className="p-4 text-sm text-destructive">
        Couldn't load the flow graph.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  if (!flowDef) return null;
  if (!version) return null;

  // Was SidePanel.tsx's own renderTab() switch -- moved here once its
  // prop list (the union of every tab's individual data needs) got large
  // enough that SidePanel's own signature no longer made sense as the
  // place to hold it, given this component already has all of it via the
  // hook above. A const arrow function, not a hoisted function
  // declaration -- TS can carry flowDef/version's narrowing (from the
  // guards above) into this closure only because it's evaluated in place,
  // after them; a hoisted declaration would be callable from earlier in
  // this scope too, as far as the type-checker can tell, so it can't
  // assume they're narrowed.
  const renderSidePanelTab = (tab: SidePanelTab) => {
    switch (tab) {
      case "runinput":
        return (
          <RunInputTab
            flowDef={flowDef}
            params={params}
            artifacts={artifacts}
            selectedParamHashes={selectedParamHashes}
            onParamChange={handleParamChange}
            missingRequiredParams={missingRequiredParams}
            readOnly={runOpened}
            paramsLoading={paramsLoading}
            paramsError={paramsError}
            versionId={versionId}
            panelId={panelId}
            curatedArtifacts={curatedArtifacts}
            onOpenArtifact={handleOpenArtifact}
          />
        );
      case "sim":
        return (
          <SimTab
            simDefinition={activeSimDefinition}
            runId={runId}
            simDraftActive={simDraft !== null}
            onStartAuthoring={handleStartAuthoring}
          />
        );
      case "problems":
        return <ProblemsTab problems={problems} />;
      case "parameters":
        return <ParametersTab params={params} />;
      case "stepdetails":
        return (
          <StepDetailsTab
            stepId={selectedStepId}
            flowDef={flowDef}
            onNavigateToDefinition={handleRevealInDefinition}
          />
        );
      case "stepresults":
        return (
          <StepResultsTab
            stepId={selectedStepId}
            flowDef={flowDef}
            refs={flowAnalysis?.flowAnalysis.refs ?? []}
            paramHashes={selectedParamHashes}
            stepRunInfo={stepRunInfo}
            runId={runId}
            isReused={isReusedForSelectedStep}
            onToggleReused={onToggleReuse}
            onOpenArtifact={handleOpenArtifact}
          />
        );
      case "settings":
        return <SettingsTab version={version} start={flowDef.start} />;
      default: {
        const _exhaustive: never = tab;
        return _exhaustive;
      }
    }
  };

  const toolbar = (
    <RunToolbar
      hasParams={Object.keys(params).length > 0}
      paramsHasUnsetRequired={missingRequiredParams.length > 0}
      showSimulate={!simId && !replay}
      runDisabled={runDisabled}
      onOpenParams={handleOpenParams}
      onOpenSim={handleOpenSimulate}
      onOpenEventGraph={handleOpenEventGraph}
      onRun={handleRun}
      isRerun={runOpened}
      layoutDirection={layoutDirection}
      onSetLayoutDirection={handleSetLayoutDirection}
      replayAvailable={replayAvailable}
      replay={replay}
      replaySpeed={replaySpeed}
      onTogglePlayPause={handleTogglePlayPause}
      onCancelReplay={handleCancelReplay}
      onSetReplaySpeed={handleSetReplaySpeed}
    />
  );

  const graph = (
    <FlowGraph
      flowDef={flowDef}
      layout={flowAnalysis?.layout ?? null}
      outEdges={flowAnalysis?.flowAnalysis.outEdges ?? {}}
      stepRunInfo={stepRunInfo}
      reusedStepIds={reusedStepIds}
      selectedStepId={selectedStepId}
      viewport={viewport}
      onViewportChange={handleViewportChange}
      toolbar={toolbar}
      authoringBar={
        simDraft && (
          <SimAuthoringBar
            reuseCount={simDraft.reuse.length}
            onSave={() => setSaveDialogOpen(true)}
            onCancel={handleDraftEnded}
          />
        )
      }
      onNodeClickHandler={handleNodeClick}
    />
  );

  // Mounted whenever a draft exists, regardless of which rail tab (if any)
  // is active -- its trigger lives in the authoring bar above, not inside
  // the Simulate tab, so it can't be nested under either return below.
  // runId! is safe: simDraft can only be non-null while a real run is
  // loaded, since starting one is only reachable from SimTab's
  // has-a-run-no-sim-yet branch.
  const saveDialog = simDraft && (
    <SaveSimDialog
      open={saveDialogOpen}
      onOpenChange={setSaveDialogOpen}
      flowId={version.flowId}
      flowVersionId={versionId}
      parentRunId={runId!}
      reuse={simDraft.reuse}
      onSaved={handleDraftEnded}
    />
  );

  if (!sidePanelTab) {
    return (
      <>
        <div className="flex h-full">
          <div className="flex-1">{graph}</div>
          <Rail
            activeTab={sidePanelTab}
            onSelectTab={handleSelectSidePanelTab}
            problemsCount={problems.length}
          />
        </div>
        {saveDialog}
      </>
    );
  }

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="h-full ">
        <ResizablePanel defaultSize="70%">{graph}</ResizablePanel>
        <ResizableHandle className="bg-dock-panel-border" />
        <ResizablePanel defaultSize="30%" minSize="15%">
          <div className="flex h-full border-t border-t-dock-panel-border">
            <Rail
              activeTab={sidePanelTab}
              onSelectTab={handleSelectSidePanelTab}
              problemsCount={problems.length}
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
      {saveDialog}
    </>
  );
}
