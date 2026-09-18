import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import type { Node } from "@xyflow/react";
import { useGetFlowVersionDefQuery } from "@/redux/api/flows-api";
import { useListArtifactsQuery } from "@/redux/api/artifacts-api";
import {
  useGetRunDetailQuery,
  useGetRunParamsQuery,
  useRequestRunMutation,
} from "@/redux/api/runs-api";
import { useGetSimQuery } from "@/redux/api/sims-api";
import { useAppDispatch, useAppSelector } from "@/redux/typed-hooks";
import {
  paramHashSet,
  paramsSeeded,
  sidePanelTabSet,
  runSubmitted,
  runSelected,
  stepSelected,
  simDraftStarted,
  simDraftReuseToggled,
  simDraftEnded,
  layoutDirectionSet,
  viewportChanged,
  selectFlowGraphPanelState,
  type SimDraftState,
  type LayoutDirection,
  type FlowGraphViewport,
} from "@/redux/slices/flow-graph-panels-slice";
import { useFlowAnalysis } from "@/components/workbench/flow-graph-panel/use-flow-analysis";
import { useRunEventsWithStatus } from "@/components/workbench/shared/events/use-run-events-with-status";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { useFlowGraphReplay } from "@/components/workbench/shared/events/use-flow-graph-replay";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import { openOrFocusPanel } from "@/components/workbench/dock/dock-panels";
import type { SidePanelTab } from "@/components/workbench/shared/flow-graph/SidePanel";

// Pure -- no React/Redux dependency, just the four inputs that decide it.
// Priority: control-flow steps and no-selection both mean nothing to show;
// otherwise an in-progress draft's own plan wins over an existing sim's
// saved one, since only one is ever relevant for a given panel at a time.
function isReusedForStep(
  stepId: string | null,
  isControlFlowStep: boolean,
  simDraft: SimDraftState | null,
  reuse: string[] | null,
): boolean | undefined {
  if (isControlFlowStep || !stepId) return;
  if (simDraft) return simDraft.reuse.includes(stepId);
  if (reuse) return reuse.includes(stepId);
  return;
}

// All the data-fetching, Redux read/write, and derived state a Flow Graph
// panel needs -- Content.tsx (the only caller) is left holding just JSX
// composition and the side-panel-tab render switch, once this got large
// enough that keeping it all inline made the component hard to scan.
export function useFlowGraphPanel(
  versionId: string,
  panelId: string,
  simId?: string,
  runOpened = false,
) {
  const { data, error, isLoading, refetch } =
    useGetFlowVersionDefQuery(versionId);
  const showLoading = useDelayedLoading(isLoading);
  const { data: artifactsData } = useListArtifactsQuery();
  const { data: curatedArtifactsData } = useListArtifactsQuery({
    flowVersionId: versionId,
    curated: "true",
  });
  const dockviewApi = useDockviewApi();
  const { data: simDefData } = useGetSimQuery(simId ? { simId } : skipToken);
  const [requestRun] = useRequestRunMutation();

  const dispatch = useAppDispatch();
  const {
    selectedParamHashes,
    sidePanelTab,
    runId,
    selectedStepId,
    simDraft,
    layoutDirection,
    viewport,
  } = useAppSelector((state) => selectFlowGraphPanelState(state, panelId));
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const simDefinition = simDefData?.ok ? simDefData.value : null;

  // Broader than `simId`/`simDefinition` above (which only ever reflect
  // *this panel having been opened directly from a sim*): this also covers
  // a plain or run-specific panel whose currently-displayed run just
  // happens to have used a sim. Only feeds the Sim tab's identity display
  // -- seeding, handleRun's forkSpecHash, and the reuse overlay all stay
  // keyed on the explicit `simId` prop only, unchanged.
  const { data: runDetailData } = useGetRunDetailQuery(
    runId ? { runId } : skipToken,
  );
  const activeRunSimId =
    simId ?? (runDetailData?.ok ? runDetailData.value.run.simId : undefined);
  const { data: activeSimDefData } = useGetSimQuery(
    activeRunSimId ? { simId: activeRunSimId } : skipToken,
  );
  const activeSimDefinition = activeSimDefData?.ok
    ? activeSimDefData.value
    : null;

  // Seeds this panel's runId from the sim's parent run exactly once, on
  // first mount -- gated on runId still being null so it never re-fires
  // once a real run's been submitted from this panel (or been restored
  // from persistence).
  useEffect(() => {
    if (simId && simDefinition && runId === null) {
      dispatch(runSelected({ panelId, runId: simDefinition.spec.parentRunId }));
    }
  }, [simId, simDefinition, runId, panelId, dispatch]);

  // Fetched for a run-opened panel OR a sim-opened one -- runId is already
  // non-null from mount for the run case (seeded by FlowExplorer.tsx's
  // onSelectRun before this panel even opens) and one render later for the
  // sim case (seeded by the effect above, from the sim's parentRunId), so
  // unlike that effect, `runId === null` can't serve as the "not yet
  // seeded" gate here; a local ref does instead. Sims stay editable after
  // seeding (readOnly only reflects runOpened, unchanged) -- this only
  // widens *when* seeding happens, not whether it stays editable after.
  const shouldSeedParams = runOpened || Boolean(simId);
  const { data: runParamsData, isLoading: isRunParamsLoading } =
    useGetRunParamsQuery(shouldSeedParams && runId ? { runId } : skipToken);
  const paramsLoading = useDelayedLoading(
    shouldSeedParams && isRunParamsLoading,
  );
  const paramsError = shouldSeedParams && runParamsData?.ok === false;

  const hasSeededRunParams = useRef(false);
  useEffect(() => {
    if (
      shouldSeedParams &&
      runId &&
      runParamsData?.ok &&
      !hasSeededRunParams.current
    ) {
      hasSeededRunParams.current = true;
      dispatch(paramsSeeded({ panelId, hashes: runParamsData.value }));
    }
  }, [shouldSeedParams, runId, runParamsData, panelId, dispatch]);

  const hasError = Boolean(error) || data?.ok === false;
  useEffect(() => {
    if (hasError) {
      toast.error("Couldn't load the flow graph", { duration: Infinity });
    }
  }, [hasError]);

  const flowDef = data?.ok ? data.value.definition : null;
  const version = data?.ok ? data.value.version : null;
  const flowAnalysis = useFlowAnalysis(flowDef, layoutDirection);
  const artifacts = artifactsData?.ok ? artifactsData.value : [];
  const curatedArtifacts = curatedArtifactsData?.ok
    ? curatedArtifactsData.value
    : [];
  const problems = flowAnalysis?.flowAnalysis.problems ?? [];

  // stable across renders unless flowDef itself changes -- otherwise a fresh
  // array every render invalidates useStepRunInfo's (and, downstream,
  // FlowGraph's own node/edge) memoization by reference on every unrelated
  // re-render, e.g. just switching the side panel's tab
  const stepIds = useMemo(
    () => (flowDef ? Object.keys(flowDef.steps) : []),
    [flowDef],
  );
  const { events, stepRunInfo } = useRunEventsWithStatus(runId, stepIds);

  const params = flowDef?.params ?? {};
  const requiredParamNames = Object.entries(params)
    .filter(([, def]) => def.optional !== true)
    .map(([name]) => name);
  const missingRequiredParams = requiredParamNames.filter(
    (name) => !selectedParamHashes[name],
  );
  const runInFlight =
    runId !== null &&
    !events.some((e) => e.type === "run.completed" || e.type === "run.failed");

  // Replay only makes sense once a run is actually done -- reusing
  // runInFlight (already computed directly from the in-hand events array)
  // rather than a separate RunRecord.status fetch: no new query, and no
  // propagation lag between the event stream finishing and a SQL
  // projection catching up. Also unavailable during sim authoring -- see
  // showSimulate below for the symmetric direction.
  const replayAvailable = runId !== null && !runInFlight && simDraft === null;
  const {
    replay,
    replaySpeed,
    effectiveStepRunInfo,
    handleTogglePlayPause,
    handleCancelReplay,
    handleSetReplaySpeed,
  } = useFlowGraphReplay(
    panelId,
    events,
    stepIds,
    stepRunInfo,
    replayAvailable,
  );

  // Authoring blocks Run outright rather than defining what a rerun (or
  // reopening this same panel at a different run) mid-draft would mean --
  // authoring has to be finished or explicitly cancelled first. Replaying
  // blocks it for the same "don't let two modes fight" reason: starting a
  // brand-new run while an old run's replay is still animating over its
  // (about to be stale) graph state would be a real collision, not just a
  // visual mismatch.
  const runDisabled =
    missingRequiredParams.length > 0 ||
    runInFlight ||
    simDraft !== null ||
    replay !== null;

  // Only set while still looking at the sim's own parent run -- stops
  // applying the moment you run something new from this panel, since the
  // reuse plan only ever described that original parent run.
  const reuse =
    simDefinition && runId === simDefinition.spec.parentRunId
      ? simDefinition.spec.reuse
      : null;
  const authoringReusedStepIds = simDraft ? simDraft.reuse : undefined;

  // Event-sourced fallback for any run other than a sim's own parent run --
  // one that executed the sim rather than being authored from it -- mirroring
  // StepResultsTab.tsx's own sourceRunId !== undefined check for the same
  // question. Derived from effectiveStepRunInfo (not the raw stepRunInfo
  // above) so a badge only appears once replay's scrubber has actually
  // reached that step's step.reused event, same as its status does.
  // Memoized since FlowGraph's own layout memo depends on reusedStepIds by
  // reference.
  const outcomeReusedStepIds = useMemo(
    () =>
      Object.entries(effectiveStepRunInfo)
        .filter(([, info]) => info.sourceRunId !== undefined)
        .map(([stepId]) => stepId),
    [effectiveStepRunInfo],
  );
  const reusedStepIds = authoringReusedStepIds ?? reuse ?? outcomeReusedStepIds;

  // The engine doesn't support reusing pure control-flow steps -- no
  // switch is shown for them at all, not merely disabled.
  const selectedStepType = selectedStepId
    ? flowDef?.steps[selectedStepId]?.type
    : undefined;
  const isControlFlowStep =
    selectedStepType === "parallel" || selectedStepType === "join";

  const isReusedForSelectedStep = isReusedForStep(
    selectedStepId,
    isControlFlowStep,
    simDraft,
    reuse,
  );

  const onToggleReuse =
    simDraft && selectedStepId && !isControlFlowStep
      ? () =>
          dispatch(simDraftReuseToggled({ panelId, stepId: selectedStepId }))
      : undefined;

  const handleParamChange = (name: string, hash: string | undefined) => {
    dispatch(paramHashSet({ panelId, name, hash }));
  };

  const handleSelectSidePanelTab = (tab: SidePanelTab | null) => {
    dispatch(sidePanelTabSet({ panelId, tab }));
  };

  const handleOpenParams = () => handleSelectSidePanelTab("runinput");

  // No run active -> Step Details (static definition); run active ->
  // Step Results (status/output/exports) instead. Either tab stays
  // manually selectable via the rail regardless of run state -- this only
  // gates the auto-switch on node click.
  const handleNodeClick = (node: Node) => {
    dispatch(stepSelected({ panelId, stepId: node.id }));
    handleSelectSidePanelTab(runId ? "stepresults" : "stepdetails");
  };

  const handleRun = async () => {
    if (!flowDef || !version) return;
    const entries = Object.entries(selectedParamHashes).filter(([, hash]) =>
      Boolean(hash),
    );
    const result = await requestRun({
      flowId: version.flowId,
      flowVersionId: versionId,
      flowDefHash: version.definitionHash,
      ...(entries.length > 0 ? { params: Object.fromEntries(entries) } : {}),
      ...(simId && simDefinition
        ? { simId, forkSpecHash: simDefinition.sim.forkSpecHash }
        : {}),
    });
    if (result.data?.ok) {
      dispatch(runSubmitted({ panelId, runId: result.data.runId }));
    }
  };

  // Opens (or focuses) the singleton EventGraph panel. "Event Graph" is a
  // deliberately generic label, not describing current content, since the
  // panel has no per-instance identity to name. initialTrackedPanelId is a
  // one-shot seed passed as this panel's own id (see
  // use-tracked-flow-graph-panel.ts for why it can't just ask dockview who's
  // active) -- has no effect on an already-open singleton.
  const handleOpenEventGraph = () => {
    if (!dockviewApi) return;
    openOrFocusPanel(
      dockviewApi,
      {
        kind: "event-graph",
        label: "Event Graph",
        initialTrackedPanelId: panelId,
      },
      { position: { direction: "below", referencePanel: panelId } },
    );
  };

  // With a real run loaded and no draft already in flight, Simulate skips
  // the intermediate "This run isn't a sim yet" tab state entirely and
  // starts authoring immediately -- the in-tab "Simulate this run" button
  // (SimTab.tsx, via handleStartAuthoring below) stays as a second way in
  // for resuming after a cancel via the rail instead of this toolbar
  // button. Not gated on an existing incidental sim (activeSimDefinition):
  // chaining a new draft off a sim-derived run is allowed, same as any
  // other run. Unreachable at all once a direct simId is set --
  // showSimulate={!simId} hides this button in that case. Also unreachable
  // while replay is active -- symmetric with replayAvailable excluding
  // simDraft above: the two features would otherwise fight over the same
  // stepRunInfo/reuse-overlay rendering with no designed interaction
  // between them (a real future direction -- snapshotting a replayed
  // moment into a sim -- but not this guard's job to build).
  const handleOpenSimulate = () => {
    if (replay) return;
    handleSelectSidePanelTab("sim");
    if (runId && !simDraft) {
      dispatch(simDraftStarted({ panelId }));
    }
  };

  const handleStartAuthoring = () => {
    if (replay) return;
    dispatch(simDraftStarted({ panelId }));
  };

  // Routes a real CAS artifact (a step's run output/export, a run param's
  // selected artifact) into the existing artifact panel kind instead of the
  // old page-only inline-text preview -- label is caller-supplied context
  // (e.g. `Step "x" output`), not derived from the artifact itself, since
  // callers already compute a better title than the artifact's own
  // filename/label would give.
  const handleOpenArtifact = (hash: string, label: string) => {
    if (!dockviewApi) return;
    openOrFocusPanel(dockviewApi, { kind: "artifact", label, hash, versionId });
  };

  // Navigates the existing json-definition panel to a spot inside this
  // version's own definition (a step's body, an export's schema, etc.)
  // instead of opening an isolated content panel -- see the related change in
  // docs/initiatives/ui-workspace/INITIATIVE.md. revealAt is a fresh timestamp per call
  // so repeated clicks to the same path still re-trigger the reveal.
  const handleRevealInDefinition = (path: string[]) => {
    if (!dockviewApi || !version) return;
    openOrFocusPanel(dockviewApi, {
      kind: "json-definition",
      label: `${version.versionLabel ?? `Version ${version.sequence}`} JSON`,
      versionId,
      revealPath: path,
      revealAt: Date.now(),
    });
  };

  // Dispatched on both explicit cancel and after a successful save -- same
  // "stop authoring" meaning either way, matching the reducer's own name.
  const handleDraftEnded = () => {
    dispatch(simDraftEnded({ panelId }));
  };

  const handleSetLayoutDirection = (direction: LayoutDirection) => {
    dispatch(layoutDirectionSet({ panelId, direction }));
  };

  const handleViewportChange = (viewport: FlowGraphViewport) => {
    dispatch(viewportChanged({ panelId, viewport }));
  };

  return {
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
    stepRunInfo: effectiveStepRunInfo,
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
    handleOpenArtifact,
    handleRevealInDefinition,
    handleSelectSidePanelTab,
    handleStartAuthoring,
    handleDraftEnded,
    layoutDirection,
    handleSetLayoutDirection,
    viewport,
    handleViewportChange,
    runOpened,
    paramsLoading,
    paramsError,
    curatedArtifacts,
  };
}
