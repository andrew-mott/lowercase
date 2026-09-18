import { describe, expect, it } from "vitest";
import {
  artifactPanelsSlice,
  sidePanelTabSet,
  startEditingArtifactMetadata,
  updateDraftLabel,
  setDraftShare,
  toggleDraftParam,
  artifactMetadataSaved,
  cancelEditingArtifactMetadata,
  selectArtifactPanelState,
} from "@/redux/slices/artifact-panels-slice";
import { panelRemoved } from "@/redux/slices/panel-lifecycle-actions";
import type { RootState } from "@/redux/store";

const reducer = artifactPanelsSlice.reducer;

const DEFAULT_PANEL_STATE = {
  sidePanelTab: null,
  draft: null,
  isEditing: false,
};

const PANEL_A = "artifact-hash-a";
const PANEL_B = "artifact-hash-b";

describe("artifactPanelsSlice", () => {
  describe("sidePanelTabSet", () => {
    it("creates a panel entry lazily and sets sidePanelTab", () => {
      const state = reducer(
        {},
        sidePanelTabSet({ panelId: PANEL_A, tab: "metadata" }),
      );
      expect(state[PANEL_A]).toEqual({
        ...DEFAULT_PANEL_STATE,
        sidePanelTab: "metadata",
      });
    });
  });

  describe("startEditingArtifactMetadata / draft editing", () => {
    it("seeds a draft and enters editing", () => {
      const state = reducer(
        {},
        startEditingArtifactMetadata({
          panelId: PANEL_A,
          draft: { label: "notes", share: false, curatedParamNames: [] },
        }),
      );
      expect(state[PANEL_A]).toEqual({
        ...DEFAULT_PANEL_STATE,
        isEditing: true,
        draft: { label: "notes", share: false, curatedParamNames: [] },
      });
    });

    it("updateDraftLabel/setDraftShare/toggleDraftParam mutate the draft in place", () => {
      let state = reducer(
        {},
        startEditingArtifactMetadata({
          panelId: PANEL_A,
          draft: { label: "notes", share: false, curatedParamNames: [] },
        }),
      );
      state = reducer(
        state,
        updateDraftLabel({ panelId: PANEL_A, label: "renamed" }),
      );
      state = reducer(state, setDraftShare({ panelId: PANEL_A, share: true }));
      state = reducer(
        state,
        toggleDraftParam({
          panelId: PANEL_A,
          paramName: "inputText",
          checked: true,
        }),
      );
      expect(state[PANEL_A].draft).toEqual({
        label: "renamed",
        share: true,
        curatedParamNames: ["inputText"],
      });

      state = reducer(
        state,
        toggleDraftParam({
          panelId: PANEL_A,
          paramName: "inputText",
          checked: false,
        }),
      );
      expect(state[PANEL_A].draft?.curatedParamNames).toEqual([]);
    });

    it("artifactMetadataSaved exits editing but keeps the draft", () => {
      let state = reducer(
        {},
        startEditingArtifactMetadata({
          panelId: PANEL_A,
          draft: { label: "notes", share: false, curatedParamNames: [] },
        }),
      );
      state = reducer(state, artifactMetadataSaved({ panelId: PANEL_A }));
      expect(state[PANEL_A].isEditing).toBe(false);
      expect(state[PANEL_A].draft).toEqual({
        label: "notes",
        share: false,
        curatedParamNames: [],
      });
    });

    it("cancelEditingArtifactMetadata exits editing and drops the draft", () => {
      let state = reducer(
        {},
        startEditingArtifactMetadata({
          panelId: PANEL_A,
          draft: { label: "notes", share: false, curatedParamNames: [] },
        }),
      );
      state = reducer(
        state,
        cancelEditingArtifactMetadata({ panelId: PANEL_A }),
      );
      expect(state[PANEL_A].isEditing).toBe(false);
      expect(state[PANEL_A].draft).toBeNull();
    });
  });

  // the actual bug this slice exists to fix (see the related change in
  // docs/initiatives/ui-workspace/INITIATIVE.md): flow-version-artifacts-slice.ts's old
  // singleton draft would collide between two simultaneously open panels --
  // this asserts the two panelIds stay fully independent instead.
  it("keeps two panels' edit sessions fully independent", () => {
    let state = reducer(
      {},
      startEditingArtifactMetadata({
        panelId: PANEL_A,
        draft: { label: "artifact-a", share: false, curatedParamNames: [] },
      }),
    );
    state = reducer(
      state,
      startEditingArtifactMetadata({
        panelId: PANEL_B,
        draft: { label: "artifact-b", share: true, curatedParamNames: [] },
      }),
    );
    state = reducer(
      state,
      updateDraftLabel({ panelId: PANEL_B, label: "artifact-b-renamed" }),
    );

    expect(state[PANEL_A].draft).toEqual({
      label: "artifact-a",
      share: false,
      curatedParamNames: [],
    });
    expect(state[PANEL_B].draft).toEqual({
      label: "artifact-b-renamed",
      share: true,
      curatedParamNames: [],
    });
  });

  describe("panelRemoved", () => {
    it("deletes an existing key", () => {
      let state = reducer(
        {},
        sidePanelTabSet({ panelId: PANEL_A, tab: "metadata" }),
      );
      state = reducer(state, panelRemoved({ panelId: PANEL_A }));
      expect(state[PANEL_A]).toBeUndefined();
    });

    it("no-ops when the key doesn't exist", () => {
      const state = reducer({}, panelRemoved({ panelId: "does-not-exist" }));
      expect(state).toEqual({});
    });
  });

  describe("selectArtifactPanelState", () => {
    it("returns the shared default when no entry exists for the panelId", () => {
      const rootState = { artifactPanels: {} } as unknown as RootState;
      expect(selectArtifactPanelState(rootState, PANEL_A)).toEqual(
        DEFAULT_PANEL_STATE,
      );
    });

    it("returns the real entry once one exists", () => {
      const populated = reducer(
        {},
        sidePanelTabSet({ panelId: PANEL_A, tab: "metadata" }),
      );
      const rootState = {
        artifactPanels: populated,
      } as unknown as RootState;
      expect(selectArtifactPanelState(rootState, PANEL_A)).toEqual({
        ...DEFAULT_PANEL_STATE,
        sidePanelTab: "metadata",
      });
    });
  });
});
