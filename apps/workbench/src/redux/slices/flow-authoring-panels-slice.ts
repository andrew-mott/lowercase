import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import { panelRemoved } from "./panel-lifecycle-actions";

export type FlowAuthoringPanelState = {
  content: string;
};

export type FlowAuthoringPanelsState = Record<string, FlowAuthoringPanelState>;

const DEFAULT_PANEL_STATE: FlowAuthoringPanelState = {
  content: "",
};

const initialState: FlowAuthoringPanelsState = {};

function ensurePanel(state: FlowAuthoringPanelsState, panelId: string) {
  return (state[panelId] ??= { ...DEFAULT_PANEL_STATE });
}

export const flowAuthoringPanelsSlice = createSlice({
  name: "flowAuthoringPanels",
  initialState,
  reducers: {
    setFlowAuthoringContent: (
      state,
      action: PayloadAction<{ panelId: string; content: string }>,
    ) => {
      ensurePanel(state, action.payload.panelId).content =
        action.payload.content;
    },
  },
  // panelRemoved is shared across every keyed-by-panelId slice (see
  // panel-lifecycle-actions.ts).
  extraReducers: (builder) => {
    builder.addCase(panelRemoved, (state, action) => {
      delete state[action.payload.panelId];
    });
  },
});

export const { setFlowAuthoringContent } = flowAuthoringPanelsSlice.actions;

export const selectFlowAuthoringPanelState = (
  state: RootState,
  panelId: string,
): FlowAuthoringPanelState =>
  state.flowAuthoringPanels[panelId] ?? DEFAULT_PANEL_STATE;
