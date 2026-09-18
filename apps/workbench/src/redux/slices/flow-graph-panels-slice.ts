import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import type { SidePanelTab } from "@/components/workbench/shared/flow-graph/SidePanel";
import { panelRemoved } from "./panel-lifecycle-actions";

export type SimDraftState = { reuse: string[] };
export type LayoutDirection = "TB" | "LR";
export type FlowGraphViewport = { x: number; y: number; zoom: number };

export type ReplayStatus = "playing" | "paused";
export type ReplaySpeed = 0.25 | 0.5 | 1 | 2;
// cutoffTime is epoch ms, not the ISO string CloudEvent.time uses -- callers
// convert once at the boundary (use-flow-graph-replay.ts), never here.
export type ReplayState = {
  status: ReplayStatus;
  cutoffTime: number;
};

export type FlowGraphPanelState = {
  selectedParamHashes: Record<string, string>;
  sidePanelTab: SidePanelTab | null;
  runId: string | null;
  selectedStepId: string | null;
  simDraft: SimDraftState | null;
  layoutDirection: LayoutDirection;
  viewport: FlowGraphViewport | null;
  // null means idle (not replaying) -- a rehydrated "playing" status is
  // never written back as-is; see replayStarted/replayResumed below for why
  // a cold mount can never land on an auto-resuming clock.
  replay: ReplayState | null;
  // Deliberately its own top-level field, not nested inside ReplayState --
  // a speed chosen before pressing Play needs somewhere to live while
  // replay is still null, and persists across separate replay sessions on
  // the same panel (picking 2x once means it stays 2x next time you press
  // Play, not reset to a default) -- the opposite of ReplayState itself,
  // which is fully thrown away between sessions.
  replaySpeed: ReplaySpeed;
};

export type FlowGraphPanelsState = Record<string, FlowGraphPanelState>;

const DEFAULT_PANEL_STATE: FlowGraphPanelState = {
  selectedParamHashes: {},
  sidePanelTab: null,
  runId: null,
  selectedStepId: null,
  simDraft: null,
  layoutDirection: "TB",
  viewport: null,
  replay: null,
  replaySpeed: 1,
};

const initialState: FlowGraphPanelsState = {};

// each key gets its own fresh selectedParamHashes object -- never a shared
// reference to DEFAULT_PANEL_STATE's, which would let a write to one panel
// mutate another's
function ensurePanel(state: FlowGraphPanelsState, panelId: string) {
  return (state[panelId] ??= {
    ...DEFAULT_PANEL_STATE,
    selectedParamHashes: {},
  });
}

export const flowGraphPanelsSlice = createSlice({
  name: "flowGraphPanels",
  initialState,
  reducers: {
    paramHashSet: (
      state,
      action: PayloadAction<{ panelId: string; name: string; hash?: string }>,
    ) => {
      const { panelId, name, hash } = action.payload;
      const panel = ensurePanel(state, panelId);
      if (!hash) {
        delete panel.selectedParamHashes[name];
        return;
      }
      panel.selectedParamHashes[name] = hash;
    },
    sidePanelTabSet: (
      state,
      action: PayloadAction<{
        panelId: string;
        tab: SidePanelTab | null;
      }>,
    ) => {
      ensurePanel(state, action.payload.panelId).sidePanelTab =
        action.payload.tab;
    },
    runSubmitted: (
      state,
      action: PayloadAction<{ panelId: string; runId: string }>,
    ) => {
      ensurePanel(state, action.payload.panelId).runId = action.payload.runId;
    },
    // mechanically identical to runSubmitted, but for a panel opened
    // directly at an existing historical run (from the tree's Runs list)
    // rather than one that just submitted a fresh run itself
    runSelected: (
      state,
      action: PayloadAction<{ panelId: string; runId: string }>,
    ) => {
      ensurePanel(state, action.payload.panelId).runId = action.payload.runId;
    },
    // replaces selectedParamHashes wholesale, unlike paramHashSet's
    // per-name writes -- used to seed a run-opened panel's params from that
    // run's actual resolved manifest (useGetRunParamsQuery), a one-shot
    // "here's the real record" write rather than an incremental user edit.
    paramsSeeded: (
      state,
      action: PayloadAction<{
        panelId: string;
        hashes: Record<string, string>;
      }>,
    ) => {
      ensurePanel(state, action.payload.panelId).selectedParamHashes = {
        ...action.payload.hashes,
      };
    },
    stepSelected: (
      state,
      action: PayloadAction<{ panelId: string; stepId: string }>,
    ) => {
      ensurePanel(state, action.payload.panelId).selectedStepId =
        action.payload.stepId;
    },
    simDraftStarted: (state, action: PayloadAction<{ panelId: string }>) => {
      ensurePanel(state, action.payload.panelId).simDraft = { reuse: [] };
    },
    // toggles whatever the current membership is -- matches the Switch's
    // own onCheckedChange convention downstream (StepResultsTab.tsx),
    // which is typed to take no argument, so this always flips rather than
    // ever being told the new value directly.
    simDraftReuseToggled: (
      state,
      action: PayloadAction<{ panelId: string; stepId: string }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      if (!panel.simDraft) return;
      const { stepId } = action.payload;
      panel.simDraft.reuse = panel.simDraft.reuse.includes(stepId)
        ? panel.simDraft.reuse.filter((id) => id !== stepId)
        : [...panel.simDraft.reuse, stepId];
    },
    // dispatched both on explicit cancel and after a successful save --
    // same "stop authoring" meaning either way.
    simDraftEnded: (state, action: PayloadAction<{ panelId: string }>) => {
      ensurePanel(state, action.payload.panelId).simDraft = null;
    },
    layoutDirectionSet: (
      state,
      action: PayloadAction<{ panelId: string; direction: LayoutDirection }>,
    ) => {
      ensurePanel(state, action.payload.panelId).layoutDirection =
        action.payload.direction;
    },
    viewportChanged: (
      state,
      action: PayloadAction<{ panelId: string; viewport: FlowGraphViewport }>,
    ) => {
      ensurePanel(state, action.payload.panelId).viewport =
        action.payload.viewport;
    },
    // Always starts a fresh play from startCutoffTime (the caller passes
    // the run's own first event time) -- resuming from a pause goes through
    // replayResumed instead, never this one, so a fresh play never needs to
    // branch on whatever replay happened to already be set. Doesn't touch
    // replaySpeed at all -- whatever speed was already chosen (before or
    // during a previous session) carries straight into this one.
    replayStarted: (
      state,
      action: PayloadAction<{ panelId: string; startCutoffTime: number }>,
    ) => {
      ensurePanel(state, action.payload.panelId).replay = {
        status: "playing",
        cutoffTime: action.payload.startCutoffTime,
      };
    },
    replayPaused: (state, action: PayloadAction<{ panelId: string }>) => {
      const panel = ensurePanel(state, action.payload.panelId);
      if (!panel.replay) return;
      panel.replay.status = "paused";
    },
    replayResumed: (state, action: PayloadAction<{ panelId: string }>) => {
      const panel = ensurePanel(state, action.payload.panelId);
      if (!panel.replay) return;
      panel.replay.status = "playing";
    },
    // dispatched both for an explicit Cancel and once the clock's own
    // onFinished fires -- same "stop replaying, land on the normal view"
    // meaning either way, mirroring simDraftEnded's precedent above.
    replayEnded: (state, action: PayloadAction<{ panelId: string }>) => {
      ensurePanel(state, action.payload.panelId).replay = null;
    },
    // Deliberately works whether idle or actively replaying -- choosing a
    // speed ahead of time (before ever pressing Play) is the whole point,
    // not just a mid-playback adjustment. No guard on `replay` existing.
    replaySpeedSet: (
      state,
      action: PayloadAction<{ panelId: string; speed: ReplaySpeed }>,
    ) => {
      ensurePanel(state, action.payload.panelId).replaySpeed =
        action.payload.speed;
    },
    // dispatched at up to frame rate while playing -- the clock hook skips
    // calling this at all for a frame that didn't cross a new event, so
    // this itself never needs its own no-op check beyond replay existing.
    replayTicked: (
      state,
      action: PayloadAction<{ panelId: string; cutoffTime: number }>,
    ) => {
      const panel = ensurePanel(state, action.payload.panelId);
      if (!panel.replay) return;
      panel.replay.cutoffTime = action.payload.cutoffTime;
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
  replayStarted,
  replayPaused,
  replayResumed,
  replayEnded,
  replaySpeedSet,
  replayTicked,
} = flowGraphPanelsSlice.actions;

export const selectFlowGraphPanelState = (
  state: RootState,
  panelId: string,
): FlowGraphPanelState => state.flowGraphPanels[panelId] ?? DEFAULT_PANEL_STATE;
