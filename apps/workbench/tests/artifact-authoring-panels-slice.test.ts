import { describe, expect, it } from "vitest";
import {
  artifactAuthoringPanelsSlice,
  setAuthoringContent,
  setAuthoringContentType,
  setAuthoringLabel,
  setAuthoringShare,
  toggleAuthoringParam,
  selectArtifactAuthoringPanelState,
} from "@/redux/slices/artifact-authoring-panels-slice";
import { panelRemoved } from "@/redux/slices/panel-lifecycle-actions";
import type { RootState } from "@/redux/store";

const reducer = artifactAuthoringPanelsSlice.reducer;

const DEFAULT_PANEL_STATE = {
  content: "",
  contentType: "application/json",
  label: "",
  share: false,
  curatedParamNames: [],
};

// panelIds for two different versions -- this slice is keyed by panelId,
// and dockPanelId() derives that id from versionId alone for the
// artifact-authoring kind (one draft per version), so these look like real
// ids from that scheme rather than arbitrary strings.
const PANEL_V1 = "artifact-authoring-v1";
const PANEL_V2 = "artifact-authoring-v2";

describe("artifactAuthoringPanelsSlice", () => {
  describe("setAuthoringContent/setAuthoringContentType/setAuthoringLabel/setAuthoringShare", () => {
    it("creates a panel entry lazily and sets each field", () => {
      let state = reducer(
        {},
        setAuthoringContent({ panelId: PANEL_V1, content: "hello" }),
      );
      state = reducer(
        state,
        setAuthoringContentType({
          panelId: PANEL_V1,
          contentType: "text/markdown",
        }),
      );
      state = reducer(
        state,
        setAuthoringLabel({ panelId: PANEL_V1, label: "notes" }),
      );
      state = reducer(
        state,
        setAuthoringShare({ panelId: PANEL_V1, share: true }),
      );

      expect(state[PANEL_V1]).toEqual({
        ...DEFAULT_PANEL_STATE,
        content: "hello",
        contentType: "text/markdown",
        label: "notes",
        share: true,
      });
    });
  });

  describe("toggleAuthoringParam", () => {
    it("adds and removes a param name from curatedParamNames", () => {
      let state = reducer(
        {},
        toggleAuthoringParam({
          panelId: PANEL_V1,
          paramName: "inputText",
          checked: true,
        }),
      );
      expect(state[PANEL_V1].curatedParamNames).toEqual(["inputText"]);

      state = reducer(
        state,
        toggleAuthoringParam({
          panelId: PANEL_V1,
          paramName: "inputText",
          checked: false,
        }),
      );
      expect(state[PANEL_V1].curatedParamNames).toEqual([]);
    });

    it("doesn't add the same param name twice", () => {
      let state = reducer(
        {},
        toggleAuthoringParam({
          panelId: PANEL_V1,
          paramName: "inputText",
          checked: true,
        }),
      );
      state = reducer(
        state,
        toggleAuthoringParam({
          panelId: PANEL_V1,
          paramName: "inputText",
          checked: true,
        }),
      );
      expect(state[PANEL_V1].curatedParamNames).toEqual(["inputText"]);
    });
  });

  it("keeps two versions' drafts (and their curatedParamNames arrays) fully independent", () => {
    let state = reducer(
      {},
      setAuthoringLabel({ panelId: PANEL_V1, label: "v1 draft" }),
    );
    state = reducer(
      state,
      setAuthoringLabel({ panelId: PANEL_V2, label: "v2 draft" }),
    );
    state = reducer(
      state,
      toggleAuthoringParam({
        panelId: PANEL_V1,
        paramName: "inputText",
        checked: true,
      }),
    );

    expect(state[PANEL_V1].label).toBe("v1 draft");
    expect(state[PANEL_V1].curatedParamNames).toEqual(["inputText"]);
    expect(state[PANEL_V2].label).toBe("v2 draft");
    expect(state[PANEL_V2].curatedParamNames).toEqual([]);
  });

  describe("panelRemoved", () => {
    it("deletes an existing key", () => {
      let state = reducer(
        {},
        setAuthoringLabel({ panelId: PANEL_V1, label: "draft" }),
      );
      state = reducer(state, panelRemoved({ panelId: PANEL_V1 }));
      expect(state[PANEL_V1]).toBeUndefined();
    });

    it("no-ops when the key doesn't exist", () => {
      const state = reducer({}, panelRemoved({ panelId: "does-not-exist" }));
      expect(state).toEqual({});
    });
  });

  describe("selectArtifactAuthoringPanelState", () => {
    it("returns the shared default when no entry exists for the panelId", () => {
      const rootState = {
        artifactAuthoringPanels: {},
      } as unknown as RootState;
      expect(selectArtifactAuthoringPanelState(rootState, PANEL_V1)).toEqual(
        DEFAULT_PANEL_STATE,
      );
    });

    it("returns the real entry once one exists", () => {
      const populated = reducer(
        {},
        setAuthoringLabel({ panelId: PANEL_V1, label: "draft" }),
      );
      const rootState = {
        artifactAuthoringPanels: populated,
      } as unknown as RootState;
      expect(selectArtifactAuthoringPanelState(rootState, PANEL_V1)).toEqual({
        ...DEFAULT_PANEL_STATE,
        label: "draft",
      });
    });
  });
});
