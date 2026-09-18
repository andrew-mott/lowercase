import { describe, expect, it } from "vitest";
import {
  flowGraphPanelsSlice,
  paramHashSet,
  paramsSeeded,
  sidePanelTabSet,
  runSubmitted,
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
  selectFlowGraphPanelState,
} from "@/redux/slices/flow-graph-panels-slice";
import { panelRemoved } from "@/redux/slices/panel-lifecycle-actions";
import type { RootState } from "@/redux/store";

const reducer = flowGraphPanelsSlice.reducer;

const DEFAULT_PANEL_STATE = {
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

describe("flowGraphPanelsSlice", () => {
  describe("paramHashSet", () => {
    it("creates a panel entry lazily and sets a hash", () => {
      const state = reducer(
        {},
        paramHashSet({ panelId: "flow-graph-v1", name: "a", hash: "h1" }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        selectedParamHashes: { a: "h1" },
      });
    });

    it("deletes the hash from selectedParamHashes when hash is omitted", () => {
      let state = reducer(
        {},
        paramHashSet({ panelId: "flow-graph-v1", name: "a", hash: "h1" }),
      );
      state = reducer(
        state,
        paramHashSet({ panelId: "flow-graph-v1", name: "a" }),
      );
      expect(state["flow-graph-v1"].selectedParamHashes).toEqual({});
    });
  });

  describe("paramsSeeded", () => {
    it("creates a panel entry lazily and sets selectedParamHashes wholesale", () => {
      const state = reducer(
        {},
        paramsSeeded({
          panelId: "flow-graph-v1",
          hashes: { a: "h1", b: "h2" },
        }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        selectedParamHashes: { a: "h1", b: "h2" },
      });
    });

    it("replaces the whole map rather than merging with what was there before", () => {
      let state = reducer(
        {},
        paramsSeeded({
          panelId: "flow-graph-v1",
          hashes: { a: "h1", b: "h2" },
        }),
      );
      state = reducer(
        state,
        paramsSeeded({ panelId: "flow-graph-v1", hashes: { c: "h3" } }),
      );
      expect(state["flow-graph-v1"].selectedParamHashes).toEqual({ c: "h3" });
    });
  });

  describe("sidePanelTabSet", () => {
    it("creates a panel entry lazily and sets the tab", () => {
      const state = reducer(
        {},
        sidePanelTabSet({ panelId: "flow-graph-v1", tab: "runinput" }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        sidePanelTab: "runinput",
      });
    });
  });

  describe("runSubmitted", () => {
    it("creates a panel entry lazily and sets the runId", () => {
      const state = reducer(
        {},
        runSubmitted({ panelId: "flow-graph-v1", runId: "run-1" }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        runId: "run-1",
      });
    });
  });

  describe("stepSelected", () => {
    it("creates a panel entry lazily and sets the selectedStepId", () => {
      const state = reducer(
        {},
        stepSelected({ panelId: "flow-graph-v1", stepId: "step-1" }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        selectedStepId: "step-1",
      });
    });
  });

  describe("simDraftStarted", () => {
    it("creates a panel entry lazily and starts an empty draft", () => {
      const state = reducer({}, simDraftStarted({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        simDraft: { reuse: [] },
      });
    });
  });

  describe("simDraftReuseToggled", () => {
    it("adds a step id to an empty draft", () => {
      let state = reducer({}, simDraftStarted({ panelId: "flow-graph-v1" }));
      state = reducer(
        state,
        simDraftReuseToggled({ panelId: "flow-graph-v1", stepId: "step-1" }),
      );
      expect(state["flow-graph-v1"].simDraft).toEqual({ reuse: ["step-1"] });
    });

    it("removes an already-marked step id (toggles off)", () => {
      let state = reducer({}, simDraftStarted({ panelId: "flow-graph-v1" }));
      state = reducer(
        state,
        simDraftReuseToggled({ panelId: "flow-graph-v1", stepId: "step-1" }),
      );
      state = reducer(
        state,
        simDraftReuseToggled({ panelId: "flow-graph-v1", stepId: "step-1" }),
      );
      expect(state["flow-graph-v1"].simDraft).toEqual({ reuse: [] });
    });

    it("no-ops when there's no draft to toggle against", () => {
      const state = reducer(
        {},
        simDraftReuseToggled({ panelId: "flow-graph-v1", stepId: "step-1" }),
      );
      expect(state["flow-graph-v1"]).toEqual(DEFAULT_PANEL_STATE);
    });
  });

  describe("simDraftEnded", () => {
    it("clears an in-progress draft back to null", () => {
      let state = reducer({}, simDraftStarted({ panelId: "flow-graph-v1" }));
      state = reducer(
        state,
        simDraftReuseToggled({ panelId: "flow-graph-v1", stepId: "step-1" }),
      );
      state = reducer(state, simDraftEnded({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"].simDraft).toBeNull();
    });
  });

  describe("layoutDirectionSet", () => {
    it("defaults to TB for a panel with no entry yet", () => {
      const state = { flowGraphPanels: {} } as unknown as RootState;
      expect(
        selectFlowGraphPanelState(state, "flow-graph-v1").layoutDirection,
      ).toBe("TB");
    });

    it("creates a panel entry lazily and sets the direction", () => {
      const state = reducer(
        {},
        layoutDirectionSet({ panelId: "flow-graph-v1", direction: "LR" }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        layoutDirection: "LR",
      });
    });

    it("switches back and forth on an existing entry", () => {
      let state = reducer(
        {},
        layoutDirectionSet({ panelId: "flow-graph-v1", direction: "LR" }),
      );
      state = reducer(
        state,
        layoutDirectionSet({ panelId: "flow-graph-v1", direction: "TB" }),
      );
      expect(state["flow-graph-v1"].layoutDirection).toBe("TB");
    });
  });

  describe("viewportChanged", () => {
    it("defaults to null for a panel with no entry yet", () => {
      const state = { flowGraphPanels: {} } as unknown as RootState;
      expect(
        selectFlowGraphPanelState(state, "flow-graph-v1").viewport,
      ).toBeNull();
    });

    it("creates a panel entry lazily and sets the viewport", () => {
      const state = reducer(
        {},
        viewportChanged({
          panelId: "flow-graph-v1",
          viewport: { x: 10, y: 20, zoom: 1.5 },
        }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        viewport: { x: 10, y: 20, zoom: 1.5 },
      });
    });

    it("overwrites an existing viewport on an already-created entry", () => {
      let state = reducer(
        {},
        viewportChanged({
          panelId: "flow-graph-v1",
          viewport: { x: 10, y: 20, zoom: 1.5 },
        }),
      );
      state = reducer(
        state,
        viewportChanged({
          panelId: "flow-graph-v1",
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      );
      expect(state["flow-graph-v1"].viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });
  });

  describe("replayStarted", () => {
    it("creates a panel entry lazily and starts playing at the given cutoff", () => {
      const state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        replay: { status: "playing", cutoffTime: 1000 },
      });
    });

    it("overwrites any prior replay state's status/cutoffTime, but leaves a previously-chosen speed alone -- speed is chosen ahead of time and persists across sessions, not reset per play", () => {
      let state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      state = reducer(
        state,
        replaySpeedSet({ panelId: "flow-graph-v1", speed: 2 }),
      );
      state = reducer(
        state,
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 5000 }),
      );
      expect(state["flow-graph-v1"].replay).toEqual({
        status: "playing",
        cutoffTime: 5000,
      });
      expect(state["flow-graph-v1"].replaySpeed).toBe(2);
    });
  });

  describe("replayPaused / replayResumed", () => {
    it("flips status to paused, keeping cutoffTime", () => {
      let state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      state = reducer(
        state,
        replayTicked({ panelId: "flow-graph-v1", cutoffTime: 1500 }),
      );
      state = reducer(state, replayPaused({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"].replay).toEqual({
        status: "paused",
        cutoffTime: 1500,
      });
    });

    it("flips status back to playing on resume, keeping cutoffTime", () => {
      let state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      state = reducer(state, replayPaused({ panelId: "flow-graph-v1" }));
      state = reducer(state, replayResumed({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"].replay).toEqual({
        status: "playing",
        cutoffTime: 1000,
      });
    });

    it("no-ops when there's no replay in progress", () => {
      let state = reducer({}, replayPaused({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"]).toEqual(DEFAULT_PANEL_STATE);
      state = reducer({}, replayResumed({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"]).toEqual(DEFAULT_PANEL_STATE);
    });
  });

  describe("replayEnded", () => {
    it("clears replay back to null from playing", () => {
      let state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      state = reducer(state, replayEnded({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"].replay).toBeNull();
    });

    it("clears replay back to null from paused", () => {
      let state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      state = reducer(state, replayPaused({ panelId: "flow-graph-v1" }));
      state = reducer(state, replayEnded({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"].replay).toBeNull();
    });
  });

  describe("replaySpeedSet", () => {
    it("creates a panel entry lazily and sets replaySpeed while idle -- choosing a speed ahead of time is the whole point, not just a no-op", () => {
      const state = reducer(
        {},
        replaySpeedSet({ panelId: "flow-graph-v1", speed: 2 }),
      );
      expect(state["flow-graph-v1"]).toEqual({
        ...DEFAULT_PANEL_STATE,
        replaySpeed: 2,
      });
    });

    it("supports the 0.25x option", () => {
      const state = reducer(
        {},
        replaySpeedSet({ panelId: "flow-graph-v1", speed: 0.25 }),
      );
      expect(state["flow-graph-v1"].replaySpeed).toBe(0.25);
    });

    it("updates speed on an active replay too, leaving status/cutoffTime alone", () => {
      let state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      state = reducer(
        state,
        replaySpeedSet({ panelId: "flow-graph-v1", speed: 0.5 }),
      );
      expect(state["flow-graph-v1"].replay).toEqual({
        status: "playing",
        cutoffTime: 1000,
      });
      expect(state["flow-graph-v1"].replaySpeed).toBe(0.5);
    });
  });

  describe("replayTicked", () => {
    it("no-ops when there's no replay in progress", () => {
      const state = reducer(
        {},
        replayTicked({ panelId: "flow-graph-v1", cutoffTime: 2000 }),
      );
      expect(state["flow-graph-v1"]).toEqual(DEFAULT_PANEL_STATE);
    });

    it("updates cutoffTime on an active replay, leaving status alone", () => {
      let state = reducer(
        {},
        replayStarted({ panelId: "flow-graph-v1", startCutoffTime: 1000 }),
      );
      state = reducer(
        state,
        replayTicked({ panelId: "flow-graph-v1", cutoffTime: 1800 }),
      );
      expect(state["flow-graph-v1"].replay).toEqual({
        status: "playing",
        cutoffTime: 1800,
      });
    });
  });

  it("keeps different panelIds fully independent", () => {
    let state = reducer(
      {},
      paramHashSet({ panelId: "flow-graph-v1", name: "a", hash: "h1" }),
    );
    state = reducer(
      state,
      paramHashSet({ panelId: "flow-graph-v2", name: "b", hash: "h2" }),
    );

    expect(state["flow-graph-v1"].selectedParamHashes).toEqual({ a: "h1" });
    expect(state["flow-graph-v2"].selectedParamHashes).toEqual({ b: "h2" });
  });

  describe("panelRemoved", () => {
    it("deletes an existing key", () => {
      let state = reducer(
        {},
        paramHashSet({ panelId: "flow-graph-v1", name: "a", hash: "h1" }),
      );
      state = reducer(state, panelRemoved({ panelId: "flow-graph-v1" }));
      expect(state["flow-graph-v1"]).toBeUndefined();
    });

    it("no-ops when the key doesn't exist", () => {
      const state = reducer({}, panelRemoved({ panelId: "does-not-exist" }));
      expect(state).toEqual({});
    });
  });

  describe("selectFlowGraphPanelState", () => {
    it("returns the shared default when no entry exists for the panelId", () => {
      const rootState = { flowGraphPanels: {} } as unknown as RootState;
      expect(selectFlowGraphPanelState(rootState, "flow-graph-v1")).toEqual(
        DEFAULT_PANEL_STATE,
      );
    });

    it("returns the real entry once one exists", () => {
      const populated = reducer(
        {},
        runSubmitted({ panelId: "flow-graph-v1", runId: "run-1" }),
      );
      const rootState = {
        flowGraphPanels: populated,
      } as unknown as RootState;
      expect(selectFlowGraphPanelState(rootState, "flow-graph-v1")).toEqual({
        ...DEFAULT_PANEL_STATE,
        runId: "run-1",
      });
    });
  });
});
