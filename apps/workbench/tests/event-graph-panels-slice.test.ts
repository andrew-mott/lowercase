import { describe, expect, it } from "vitest";
import {
  eventGraphPanelsSlice,
  trackedPanelSet,
  snapshotSet,
  selectedEventIdSet,
  sidePanelTabSet,
  selectEventGraphPanelState,
} from "@/redux/slices/event-graph-panels-slice";
import { panelRemoved } from "@/redux/slices/panel-lifecycle-actions";
import type { RootState } from "@/redux/store";

const reducer = eventGraphPanelsSlice.reducer;

const DEFAULT_PANEL_STATE = {
  trackedPanelId: null,
  snapshot: { runId: null, versionId: null },
  selectedEventId: null,
  sidePanelTab: null,
};

const PANEL_ID = "event-graph-singleton";

describe("eventGraphPanelsSlice", () => {
  describe("trackedPanelSet", () => {
    it("creates a panel entry lazily and sets trackedPanelId", () => {
      const state = reducer(
        {},
        trackedPanelSet({ panelId: PANEL_ID, trackedPanelId: "flow-graph-v1" }),
      );
      expect(state[PANEL_ID]).toEqual({
        ...DEFAULT_PANEL_STATE,
        trackedPanelId: "flow-graph-v1",
      });
    });
  });

  describe("snapshotSet", () => {
    it("creates a panel entry lazily and sets the snapshot", () => {
      const state = reducer(
        {},
        snapshotSet({
          panelId: PANEL_ID,
          runId: "run-1",
          versionId: "version-1",
        }),
      );
      expect(state[PANEL_ID]).toEqual({
        ...DEFAULT_PANEL_STATE,
        snapshot: { runId: "run-1", versionId: "version-1" },
      });
    });
  });

  describe("selectedEventIdSet", () => {
    it("creates a panel entry lazily and sets selectedEventId", () => {
      const state = reducer(
        {},
        selectedEventIdSet({ panelId: PANEL_ID, eventId: "event-1" }),
      );
      expect(state[PANEL_ID]).toEqual({
        ...DEFAULT_PANEL_STATE,
        selectedEventId: "event-1",
      });
    });
  });

  describe("sidePanelTabSet", () => {
    it("creates a panel entry lazily and sets sidePanelTab", () => {
      const state = reducer(
        {},
        sidePanelTabSet({ panelId: PANEL_ID, tab: "eventdetails" }),
      );
      expect(state[PANEL_ID]).toEqual({
        ...DEFAULT_PANEL_STATE,
        sidePanelTab: "eventdetails",
      });
    });
  });

  it("keeps different panelIds' snapshot objects fully independent", () => {
    let state = reducer(
      {},
      snapshotSet({ panelId: "a", runId: "run-1", versionId: "version-1" }),
    );
    state = reducer(
      state,
      snapshotSet({ panelId: "b", runId: "run-2", versionId: "version-2" }),
    );

    expect(state["a"].snapshot).toEqual({
      runId: "run-1",
      versionId: "version-1",
    });
    expect(state["b"].snapshot).toEqual({
      runId: "run-2",
      versionId: "version-2",
    });
  });

  describe("panelRemoved", () => {
    it("deletes an existing key", () => {
      let state = reducer(
        {},
        trackedPanelSet({ panelId: PANEL_ID, trackedPanelId: "flow-graph-v1" }),
      );
      state = reducer(state, panelRemoved({ panelId: PANEL_ID }));
      expect(state[PANEL_ID]).toBeUndefined();
    });

    it("no-ops when the key doesn't exist", () => {
      const state = reducer({}, panelRemoved({ panelId: "does-not-exist" }));
      expect(state).toEqual({});
    });
  });

  describe("selectEventGraphPanelState", () => {
    it("returns the shared default when no entry exists for the panelId", () => {
      const rootState = { eventGraphPanels: {} } as unknown as RootState;
      expect(selectEventGraphPanelState(rootState, PANEL_ID)).toEqual(
        DEFAULT_PANEL_STATE,
      );
    });

    it("returns the real entry once one exists", () => {
      const populated = reducer(
        {},
        selectedEventIdSet({ panelId: PANEL_ID, eventId: "event-1" }),
      );
      const rootState = {
        eventGraphPanels: populated,
      } as unknown as RootState;
      expect(selectEventGraphPanelState(rootState, PANEL_ID)).toEqual({
        ...DEFAULT_PANEL_STATE,
        selectedEventId: "event-1",
      });
    });
  });
});
