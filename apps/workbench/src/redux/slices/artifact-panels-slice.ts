import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import { panelRemoved } from "./panel-lifecycle-actions";

export type ArtifactMetadataDraft = {
  label: string;
  share: boolean;
  curatedParamNames: string[];
};

export type ArtifactSidePanelTab = "metadata";

export type ArtifactPanelState = {
  sidePanelTab: ArtifactSidePanelTab | null;
  // panelId-keyed, unlike flow-version-artifacts-slice.ts's single global
  // draft -- lets two different artifacts' metadata panels stay open and
  // edited independently at once, which that older slice can't do safely.
  draft: ArtifactMetadataDraft | null;
  isEditing: boolean;
};

export type ArtifactPanelsState = Record<string, ArtifactPanelState>;

const DEFAULT_PANEL_STATE: ArtifactPanelState = {
  sidePanelTab: null,
  draft: null,
  isEditing: false,
};

const initialState: ArtifactPanelsState = {};

// each key gets its own fresh state -- never a shared reference to
// DEFAULT_PANEL_STATE's, same precaution as flow-graph-panels-slice's
// ensurePanel (draft is scalar here, but keeping the pattern consistent)
function ensurePanel(state: ArtifactPanelsState, panelId: string) {
  return (state[panelId] ??= { ...DEFAULT_PANEL_STATE });
}

export const artifactPanelsSlice = createSlice({
  name: "artifactPanels",
  initialState,
  reducers: {
    sidePanelTabSet: (
      state,
      action: PayloadAction<{
        panelId: string;
        tab: ArtifactSidePanelTab | null;
      }>,
    ) => {
      ensurePanel(state, action.payload.panelId).sidePanelTab =
        action.payload.tab;
    },
    startEditingArtifactMetadata: (
      state,
      action: PayloadAction<{ panelId: string; draft: ArtifactMetadataDraft }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      panel.draft = action.payload.draft;
      panel.isEditing = true;
    },
    updateDraftLabel: (
      state,
      action: PayloadAction<{ panelId: string; label: string }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      if (!panel.draft) return;
      panel.draft.label = action.payload.label;
    },
    setDraftShare: (
      state,
      action: PayloadAction<{ panelId: string; share: boolean }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      if (!panel.draft) return;
      panel.draft.share = action.payload.share;
    },
    toggleDraftParam: (
      state,
      action: PayloadAction<{
        panelId: string;
        paramName: string;
        checked: boolean;
      }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      if (!panel.draft) return;
      const { paramName, checked } = action.payload;
      if (checked) {
        if (!panel.draft.curatedParamNames.includes(paramName)) {
          panel.draft.curatedParamNames.push(paramName);
        }
      } else {
        panel.draft.curatedParamNames = panel.draft.curatedParamNames.filter(
          (name) => name !== paramName,
        );
      }
    },
    // save succeeded -- exit edit mode but deliberately keep `draft` as the
    // still-correct override, matching flow-version-artifacts-slice.ts's
    // same reasoning: no moment where the panel falls back to a query cache
    // that may not have caught up yet
    artifactMetadataSaved: (
      state,
      action: PayloadAction<{ panelId: string }>,
    ) => {
      const panel = state[action.payload.panelId];
      if (!panel) return;
      panel.isEditing = false;
    },
    // discard in-progress edits -- exit edit mode AND drop the override
    cancelEditingArtifactMetadata: (
      state,
      action: PayloadAction<{ panelId: string }>,
    ) => {
      const panel = state[action.payload.panelId];
      if (!panel) return;
      panel.isEditing = false;
      panel.draft = null;
    },
  },
  // panelRemoved is shared across every keyed-by-panelId slice (see
  // panel-lifecycle-actions.ts) -- dispatched once from a central listener
  // wherever the live dockviewApi is held, not from this panel's own
  // component.
  extraReducers: (builder) => {
    builder.addCase(panelRemoved, (state, action) => {
      delete state[action.payload.panelId];
    });
  },
});

export const {
  sidePanelTabSet,
  startEditingArtifactMetadata,
  updateDraftLabel,
  setDraftShare,
  toggleDraftParam,
  artifactMetadataSaved,
  cancelEditingArtifactMetadata,
} = artifactPanelsSlice.actions;

export const selectArtifactPanelState = (
  state: RootState,
  panelId: string,
): ArtifactPanelState => state.artifactPanels[panelId] ?? DEFAULT_PANEL_STATE;
