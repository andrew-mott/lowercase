import { useEffect, useState } from "react";
import type { IDockviewPanel } from "dockview-react";
import { useAppDispatch, useAppSelector } from "@/redux/typed-hooks";
import { selectFlowGraphPanelState } from "@/redux/slices/flow-graph-panels-slice";
import {
  selectEventGraphPanelState,
  trackedPanelSet,
  snapshotSet,
} from "@/redux/slices/event-graph-panels-slice";
import type { ReplayState } from "@/redux/slices/flow-graph-panels-slice";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import {
  EVENT_GRAPH_SINGLETON_ID,
  type OpenPanelRequest,
} from "@/components/workbench/dock/dock-panels";

export type FlowGraphPanelSnapshot = {
  runId: string | null;
  versionId: string | null;
};

// replay is deliberately *not* part of the frozen snapshot -- it's a live
// read that goes stale-to-null the instant the tracked panel actually
// closes (flowGraphPanels[trackedPanelId] gets deleted wholesale by the
// shared panelRemoved reducer), which is exactly the desired "snap to full
// history" behavior once there's no driving panel left to replay from.
export type TrackedFlowGraphPanel = FlowGraphPanelSnapshot & {
  replay: ReplayState | null;
};

// Follows whichever Flow Graph panel most recently had dockview focus,
// live, and freezes (holds its last {runId, versionId}) once that panel is
// actually gone -- not merely unfocused. Focusing anything else (tree, the
// EventGraph's own panel, another panel kind) leaves tracking untouched:
// nothing in this app changes a panel's tracked run except an action taken
// while focused on it, so there's nothing to revert to. The tracked panel
// actually closing is handled separately below, by dockviewApi.getPanel
// returning nothing -- not by anything here.
export function useTrackedFlowGraphPanel(
  initialTrackedPanelId?: string,
): TrackedFlowGraphPanel {
  const dockviewApi = useDockviewApi();
  const dispatch = useAppDispatch();
  const persisted = useAppSelector((s) =>
    selectEventGraphPanelState(s, EVENT_GRAPH_SINGLETON_ID),
  );

  // Redux wins when present -- it's the accurate "who was actually being
  // tracked" signal, mirrored continuously below. initialTrackedPanelId
  // only reflects whichever flow-graph panel most recently had its Events
  // button clicked (openOrFocusPanel keeps overwriting it live, all
  // session, on every differing click), which can diverge from "who's
  // actually being tracked right now" -- e.g. click Events from panel A,
  // then just refocus panel B directly (tracking correctly follows B, live,
  // no reclick needed) -- dockview's serialized params still say A. So it
  // only matters for true cold start, before this slice has ever been
  // written to.
  const [trackedPanelId, setTrackedPanelId] = useState<string | null>(
    () => persisted.trackedPanelId ?? initialTrackedPanelId ?? null,
  );

  useEffect(() => {
    if (!dockviewApi) return;
    const sync = (panel: IDockviewPanel | undefined) => {
      const kind = (panel?.params as OpenPanelRequest | undefined)?.kind;
      if (panel && kind === "flow-graph") {
        setTrackedPanelId(panel.id);
      }
      // anything else leaves trackedPanelId untouched -- see the comment
      // above for why.
    };
    sync(dockviewApi.activePanel);
    const disposable = dockviewApi.onDidActivePanelChange((e) => sync(e.panel));
    return () => disposable.dispose();
  }, [dockviewApi]);

  useEffect(() => {
    dispatch(
      trackedPanelSet({ panelId: EVENT_GRAPH_SINGLETON_ID, trackedPanelId }),
    );
  }, [trackedPanelId, dispatch]);

  const liveRunId = useAppSelector((s) =>
    trackedPanelId ? selectFlowGraphPanelState(s, trackedPanelId).runId : null,
  );

  const liveReplay = useAppSelector((s) =>
    trackedPanelId ? selectFlowGraphPanelState(s, trackedPanelId).replay : null,
  );

  // Mirrors {runId, versionId} continuously while trackedPanelId is set --
  // including while it's legitimately blank (focused on a not-yet-run
  // panel) -- and simply stops being updated the moment tracking stops,
  // which is what "freezes" it. Computed during render (React's documented
  // "storing information from previous renders" pattern -- comparing
  // against a value from the last render and conditionally setState-ing),
  // not inside a useEffect: this is pure derivation from other state, and
  // an effect that exists only to copy one piece of state into another is
  // exactly the anti-pattern react-hooks/set-state-in-effect flags. Seeded
  // from Redux once at mount, same as trackedPanelId above.
  const [snapshot, setSnapshot] = useState<FlowGraphPanelSnapshot>(
    () => persisted.snapshot,
  );
  // Deliberately *not* seeded from Redux -- pure bookkeeping for the
  // comparison below, not real state. Starting it at null just means the
  // first render's comparison recomputes it from whatever's actually live,
  // which is correct (and harmless even if it briefly recomputes to the
  // same values snapshot was already seeded with).
  const [snapshotKey, setSnapshotKey] = useState<string | null>(null);
  const liveKey = trackedPanelId
    ? `${trackedPanelId}:${liveRunId ?? ""}`
    : null;
  if (trackedPanelId && dockviewApi && liveKey !== snapshotKey) {
    const params = dockviewApi.getPanel(trackedPanelId)?.params as
      (OpenPanelRequest & { kind: "flow-graph" }) | undefined;
    if (params) {
      setSnapshot({ runId: liveRunId, versionId: params.versionId });
      setSnapshotKey(liveKey);
    }
  }

  useEffect(() => {
    dispatch(
      snapshotSet({
        panelId: EVENT_GRAPH_SINGLETON_ID,
        runId: snapshot.runId,
        versionId: snapshot.versionId,
      }),
    );
  }, [snapshot, dispatch]);

  return { ...snapshot, replay: liveReplay };
}
