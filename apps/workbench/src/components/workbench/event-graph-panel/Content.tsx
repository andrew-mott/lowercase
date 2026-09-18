import { useEffect, useMemo, useRef } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { EventGraph } from "@/components/workbench/event-graph-panel/EventGraph";
import { useRunEventsWithStatus } from "@/components/workbench/shared/events/use-run-events-with-status";
import { filterEventsUpTo } from "@/components/workbench/shared/events/use-flow-graph-replay";
import { useGetFlowVersionDefQuery } from "@/redux/api/flows-api";
import { useGetRunDetailQuery } from "@/redux/api/runs-api";
import { useGetSimQuery } from "@/redux/api/sims-api";
import { useAppDispatch, useAppSelector } from "@/redux/typed-hooks";
import {
  selectEventGraphPanelState,
  selectedEventIdSet,
  sidePanelTabSet,
} from "@/redux/slices/event-graph-panels-slice";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  EVENT_GRAPH_SINGLETON_ID,
  openOrFocusPanel,
} from "@/components/workbench/dock/dock-panels";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import { useTrackedFlowGraphPanel } from "./use-tracked-flow-graph-panel";
import { Rail } from "./Rail";
import { SidePanel, type EventGraphSidePanelTab } from "./SidePanel";

// The one singleton EventGraph panel. What it's currently showing comes
// entirely from useTrackedFlowGraphPanel -- everything below is just
// fetching display data for {runId, versionId} and rendering it.
export function Content({
  initialTrackedPanelId,
}: {
  initialTrackedPanelId?: string;
}) {
  const { runId, versionId, replay } = useTrackedFlowGraphPanel(
    initialTrackedPanelId,
  );
  const dockviewApi = useDockviewApi();
  const dispatch = useAppDispatch();
  const { selectedEventId, sidePanelTab } = useAppSelector((s) =>
    selectEventGraphPanelState(s, EVENT_GRAPH_SINGLETON_ID),
  );

  // Clears the selection when the displayed run genuinely changes -- but
  // not on mount, since a mount can be restoring a persisted selection for
  // the *same* run (e.g. after a reload) and shouldn't immediately wipe it.
  // Can't use the render-time-compare trick use-tracked-flow-graph-panel.ts
  // uses for snapshot: that trick relies on setting *local* state during
  // render, which is safe; clearing selectedEventId means dispatching to
  // Redux, which isn't.
  const prevRunIdRef = useRef(runId);
  useEffect(() => {
    if (prevRunIdRef.current !== runId) {
      dispatch(
        selectedEventIdSet({
          panelId: EVENT_GRAPH_SINGLETON_ID,
          eventId: null,
        }),
      );
    }
    prevRunIdRef.current = runId;
  }, [runId, dispatch]);

  const { data: versionData } = useGetFlowVersionDefQuery(
    versionId ?? skipToken,
  );
  const version = versionData?.ok ? versionData.value.version : null;

  const { data: runDetailData } = useGetRunDetailQuery(
    runId ? { runId } : skipToken,
  );
  const simId = runDetailData?.ok ? runDetailData.value.run.simId : undefined;
  const { data: simDefData } = useGetSimQuery(simId ? { simId } : skipToken);
  const simDefinition = simDefData?.ok ? simDefData.value : null;

  const headerText = (() => {
    if (!version) return "No flow graph panel focused";
    const versionPart = version.versionLabel ?? `Version ${version.sequence}`;
    if (!runId) return `${versionPart} — no run yet`;
    if (simDefinition) return `${versionPart} — ${simDefinition.sim.name}`;
    const startTime = runDetailData?.ok
      ? runDetailData.value.run.startTime
      : undefined;
    const runLabel = startTime
      ? new Date(startTime).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })
      : runId;
    return `${versionPart} — ${runLabel}`;
  })();

  const { events } = useRunEventsWithStatus(runId, []);
  const displayedEvents = useMemo(
    () => filterEventsUpTo(events, replay?.cutoffTime ?? null),
    [events, replay?.cutoffTime],
  );
  const selectedEventIndex = events.findIndex((e) => e.id === selectedEventId);
  const selectedEvent =
    selectedEventIndex >= 0 ? events[selectedEventIndex] : null;

  const handleSelectTab = (tab: EventGraphSidePanelTab) =>
    dispatch(sidePanelTabSet({ panelId: EVENT_GRAPH_SINGLETON_ID, tab }));
  const handleCloseSidePanel = () =>
    dispatch(sidePanelTabSet({ panelId: EVENT_GRAPH_SINGLETON_ID, tab: null }));

  // Selecting an event always means "show its details" -- same as clicking
  // a node in the Flow Graph panel unconditionally switching to the
  // relevant side-panel tab, not just setting the selection alone.
  const handleEventClick = (eventId: string) => {
    dispatch(
      selectedEventIdSet({ panelId: EVENT_GRAPH_SINGLETON_ID, eventId }),
    );
    dispatch(
      sidePanelTabSet({
        panelId: EVENT_GRAPH_SINGLETON_ID,
        tab: "eventdetails",
      }),
    );
  };

  // Opens (or focuses) a new event-payload panel keyed by {runId, eventId}
  // -- closes over the already-in-scope runId so EventDetails.tsx only
  // ever needs to pass (eventId, label), mirroring handleOpenArtifact's
  // closure-over-versionId shape in the Flow Graph panel (the related change).
  const handleOpenEventPayload = (eventId: string, label: string) => {
    if (!dockviewApi || !runId) return;
    openOrFocusPanel(dockviewApi, {
      kind: "event-payload",
      label,
      runId,
      eventId,
    });
  };

  const graph = (
    <EventGraph
      events={displayedEvents}
      selectedEventId={selectedEventId}
      onEventClick={handleEventClick}
    />
  );

  const header = (
    <div className="shrink-0 px-3 py-1.5 text-sm text-muted-foreground">
      {headerText}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {!sidePanelTab ? (
          <div className="flex h-full">
            <div className="flex-1 min-w-0 flex h-full min-h-0 flex-col">
              {header}
              <div className="flex-1 min-h-0">{graph}</div>
            </div>
            <Rail activeTab={sidePanelTab} onSelectTab={handleSelectTab} />
          </div>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full border-dock-panel-border"
          >
            <ResizablePanel
              defaultSize="70%"
              className="flex h-full min-h-0 w-full flex-col"
              style={{ overflow: "hidden" }}
            >
              {header}
              <div className="flex-1 min-h-0">{graph}</div>
            </ResizablePanel>
            <ResizableHandle className="bg-dock-panel-border" />
            <ResizablePanel defaultSize="30%" minSize="15%">
              <div className="flex h-full border-t border-t-dock-panel-border">
                <Rail activeTab={sidePanelTab} onSelectTab={handleSelectTab} />
                <div className="flex-1 min-w-0">
                  <SidePanel
                    activeTab={sidePanelTab}
                    onClose={handleCloseSidePanel}
                    event={selectedEvent}
                    onOpenEventPayload={handleOpenEventPayload}
                    eventIndex={
                      selectedEventIndex >= 0
                        ? String(selectedEventIndex + 1)
                        : undefined
                    }
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
