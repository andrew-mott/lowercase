import { CircleAlertIcon, Footprints, VariableIcon } from "lucide-react";
import { FlowGraph } from "@/components/workbench/shared/flow-graph/FlowGraph";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { GraphViewControls } from "@/components/workbench/shared/flow-graph/GraphViewControls";
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
import { StepDetailsTab } from "@/components/workbench/shared/flow-graph/side-panel/StepDetailsTab";
import { useFlowAuthoringPreviewPanel } from "./use-flow-authoring-preview-panel";

// Only the tabs a not-yet-saved draft can actually support: Problems and
// Parameters are pure flowDef-derived, Step Details too (with its own
// "jump to definition" button deliberately inert here -- see
// docs/initiatives/ui-workspace/arcs/flow-authoring.md's the related change entry).
// Settings/Run Input/Simulate/Step Results all need a real persisted
// version or an actual run, neither of which exist yet.
const RAIL_ITEMS: RailItem[] = [
  { tab: "stepdetails", label: "Step Details", icon: Footprints },
  { tab: "parameters", label: "Parameters", icon: VariableIcon },
  { tab: "problems", label: "Problems", icon: CircleAlertIcon },
];

export function Content() {
  const {
    content,
    parseError,
    snapshot,
    displayLayout,
    isEmptySnapshot,
    selectedStepId,
    sidePanelTab,
    layoutDirection,
    handleNodeClick,
    handleSelectSidePanelTab,
    handleSetLayoutDirection,
  } = useFlowAuthoringPreviewPanel();

  // A pristine, untouched draft (nothing typed yet) shouldn't greet the
  // user with a parse-error message -- there's nothing to complain about
  // yet. Any content that's actually been typed and still doesn't parse
  // (including going back to empty after typing something) keeps showing
  // it as normal.
  const showParseError = parseError !== null && content.trim() !== "";
  const problems = snapshot.flowAnalysis.flowAnalysis.problems;
  // Folds into the same badge count as analyzeFlow's own problems -- for
  // now, just a display-time addition here, not a real FlowProblem variant
  // (that's a separate, larger task, see docs/todo.md).
  const problemsCount = problems.length + (showParseError ? 1 : 0);
  const problemsBadgeVariant = showParseError ? "error" : "default";

  const renderSidePanelTab = (tab: SidePanelTab) => {
    switch (tab) {
      case "problems":
        return (
          <>
            {showParseError && (
              <p className="mb-2 text-xs text-destructive">
                {isEmptySnapshot
                  ? "Nothing valid to preview yet -- "
                  : "Showing the last valid version -- current edits don't parse: "}
                {parseError}
              </p>
            )}
            {/* Skip FlowProblemsList's own "No problems found." specifically
                when a parse error is already showing and there's nothing
                real to list -- redundant/contradictory-looking right under
                a visible error. Real problems (from the last-good snapshot)
                alongside a parse error (about current, broken content) are
                two genuinely different things, so both stay when there
                actually are some. */}
            {(!showParseError || problems.length > 0) && (
              <ProblemsTab problems={problems} />
            )}
          </>
        );
      case "parameters":
        return <ParametersTab params={snapshot.flowDef.params ?? {}} />;
      case "stepdetails":
        return (
          <StepDetailsTab
            stepId={selectedStepId}
            flowDef={snapshot.flowDef}
            onNavigateToDefinition={() => {}}
          />
        );
      default:
        return null;
    }
  };

  const graph = (
    <FlowGraph
      flowDef={snapshot.flowDef}
      layout={displayLayout}
      outEdges={snapshot.flowAnalysis.flowAnalysis.outEdges}
      selectedStepId={selectedStepId}
      onNodeClickHandler={handleNodeClick}
      toolbar={
        <GraphViewControls
          layoutDirection={layoutDirection}
          onSetLayoutDirection={handleSetLayoutDirection}
        />
      }
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {!sidePanelTab ? (
          <div className="flex h-full">
            <div className="flex-1 min-w-0">{graph}</div>
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
            <ResizablePanel defaultSize="70%">{graph}</ResizablePanel>
            <ResizableHandle className="bg-dock-panel-border" />
            <ResizablePanel defaultSize="30%" minSize="15%">
              <div className="flex h-full">
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
