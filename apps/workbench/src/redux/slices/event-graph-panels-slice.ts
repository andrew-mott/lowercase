import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import type { EventGraphSidePanelTab } from "@/components/workbench/event-graph-panel/SidePanel";
import { panelRemoved } from "./panel-lifecycle-actions";

export type EventGraphPanelState = {
  trackedPanelId: string | null;
  snapshot: { runId: string | null; versionId: string | null };
  selectedEventId: string | null;
  sidePanelTab: EventGraphSidePanelTab | null;
};

export type EventGraphPanelsState = Record<string, EventGraphPanelState>;

const DEFAULT_PANEL_STATE: EventGraphPanelState = {
  trackedPanelId: null,
  snapshot: { runId: null, versionId: null },
  selectedEventId: null,
  sidePanelTab: null,
};

const initialState: EventGraphPanelsState = {};

// each key gets its own fresh snapshot object -- never a shared reference to
// DEFAULT_PANEL_STATE's, which would let a write to one panel mutate
// another's (same precaution as flow-graph-panels-slice's ensurePanel)
function ensurePanel(state: EventGraphPanelsState, panelId: string) {
  return (state[panelId] ??= {
    ...DEFAULT_PANEL_STATE,
    snapshot: { ...DEFAULT_PANEL_STATE.snapshot },
  });
}

export const eventGraphPanelsSlice = createSlice({
  name: "eventGraphPanels",
  initialState,
  reducers: {
    trackedPanelSet: (
      state,
      action: PayloadAction<{ panelId: string; trackedPanelId: string | null }>,
    ) => {
      ensurePanel(state, action.payload.panelId).trackedPanelId =
        action.payload.trackedPanelId;
    },
    snapshotSet: (
      state,
      action: PayloadAction<{
        panelId: string;
        runId: string | null;
        versionId: string | null;
      }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      panel.snapshot = {
        runId: action.payload.runId,
        versionId: action.payload.versionId,
      };
    },
    selectedEventIdSet: (
      state,
      action: PayloadAction<{ panelId: string; eventId: string | null }>,
    ) => {
      ensurePanel(state, action.payload.panelId).selectedEventId =
        action.payload.eventId;
    },
    sidePanelTabSet: (
      state,
      action: PayloadAction<{
        panelId: string;
        tab: EventGraphSidePanelTab | null;
      }>,
    ) => {
      ensurePanel(state, action.payload.panelId).sidePanelTab =
        action.payload.tab;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(panelRemoved, (state, action) => {
      delete state[action.payload.panelId];
    });
  },
});

export const {
  trackedPanelSet,
  snapshotSet,
  selectedEventIdSet,
  sidePanelTabSet,
} = eventGraphPanelsSlice.actions;

export const selectEventGraphPanelState = (
  state: RootState,
  panelId: string,
): EventGraphPanelState =>
  state.eventGraphPanels[panelId] ?? DEFAULT_PANEL_STATE;
