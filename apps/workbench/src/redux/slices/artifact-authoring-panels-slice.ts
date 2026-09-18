import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { FlowParamContentType } from "@lcase/types";
import type { RootState } from "../store";
import { panelRemoved } from "./panel-lifecycle-actions";

export type ArtifactAuthoringPanelState = {
  content: string;
  contentType: FlowParamContentType;
  label: string;
  share: boolean;
  curatedParamNames: string[];
};

export type ArtifactAuthoringPanelsState = Record<
  string,
  ArtifactAuthoringPanelState
>;

const DEFAULT_PANEL_STATE: ArtifactAuthoringPanelState = {
  content: "",
  contentType: "application/json",
  label: "",
  share: false,
  curatedParamNames: [],
};

const initialState: ArtifactAuthoringPanelsState = {};

// each key gets its own fresh curatedParamNames array -- never a shared
// reference to DEFAULT_PANEL_STATE's, same precaution as the other
// panel-keyed slices' ensurePanel
function ensurePanel(state: ArtifactAuthoringPanelsState, panelId: string) {
  return (state[panelId] ??= { ...DEFAULT_PANEL_STATE, curatedParamNames: [] });
}

export const artifactAuthoringPanelsSlice = createSlice({
  name: "artifactAuthoringPanels",
  initialState,
  reducers: {
    setAuthoringContent: (
      state,
      action: PayloadAction<{ panelId: string; content: string }>,
    ) => {
      ensurePanel(state, action.payload.panelId).content =
        action.payload.content;
    },
    setAuthoringContentType: (
      state,
      action: PayloadAction<{
        panelId: string;
        contentType: FlowParamContentType;
      }>,
    ) => {
      ensurePanel(state, action.payload.panelId).contentType =
        action.payload.contentType;
    },
    setAuthoringLabel: (
      state,
      action: PayloadAction<{ panelId: string; label: string }>,
    ) => {
      ensurePanel(state, action.payload.panelId).label = action.payload.label;
    },
    setAuthoringShare: (
      state,
      action: PayloadAction<{ panelId: string; share: boolean }>,
    ) => {
      ensurePanel(state, action.payload.panelId).share = action.payload.share;
    },
    toggleAuthoringParam: (
      state,
      action: PayloadAction<{
        panelId: string;
        paramName: string;
        checked: boolean;
      }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      const { paramName, checked } = action.payload;
      if (checked) {
        if (!panel.curatedParamNames.includes(paramName)) {
          panel.curatedParamNames.push(paramName);
        }
      } else {
        panel.curatedParamNames = panel.curatedParamNames.filter(
          (name) => name !== paramName,
        );
      }
    },
  },
  // panelRemoved is shared across every keyed-by-panelId slice (see
  // panel-lifecycle-actions.ts) -- handles both Cancel (which just calls
  // the panel's own api.close()) and the tab's own close-X identically,
  // since both end up here the same way.
  extraReducers: (builder) => {
    builder.addCase(panelRemoved, (state, action) => {
      delete state[action.payload.panelId];
    });
  },
});

export const {
  setAuthoringContent,
  setAuthoringContentType,
  setAuthoringLabel,
  setAuthoringShare,
  toggleAuthoringParam,
} = artifactAuthoringPanelsSlice.actions;

export const selectArtifactAuthoringPanelState = (
  state: RootState,
  panelId: string,
): ArtifactAuthoringPanelState =>
  state.artifactAuthoringPanels[panelId] ?? DEFAULT_PANEL_STATE;
