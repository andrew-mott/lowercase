import { describe, expect, it } from "vitest";
import {
  closeTab,
  explorerTabsSlice,
  openOrFocusTab,
  setActiveTab,
} from "@/redux/slices/dock-tabs-slice";

const reducer = explorerTabsSlice.reducer;

const BASE_STATE = {
  tabs: [],
  activeTabId: null,
};

describe("explorerTabsSlice", () => {
  describe("openOrFocusTab", () => {
    it("creates a new tab and activates it when none exists for that kind", () => {
      const state = reducer(
        BASE_STATE,
        openOrFocusTab({
          kind: "flow-settings",
          label: "Flow A",
          flowId: "flow-a",
        }),
      );
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0]).toEqual({
        id: "flow-settings",
        kind: "flow-settings",
        label: "Flow A",
        flowId: "flow-a",
      });
      expect(state.activeTabId).toBe("flow-settings");
    });

    it("overwrites the existing tab for the same kind instead of duplicating", () => {
      let state = reducer(
        BASE_STATE,
        openOrFocusTab({
          kind: "flow-settings",
          label: "Flow A",
          flowId: "flow-a",
        }),
      );
      state = reducer(
        state,
        openOrFocusTab({
          kind: "version-settings",
          label: "Version 1",
          versionId: "version-1",
        }),
      );
      state = reducer(
        state,
        openOrFocusTab({
          kind: "flow-settings",
          label: "Flow B",
          flowId: "flow-b",
        }),
      );

      expect(state.tabs).toHaveLength(2);
      const flowTab = state.tabs.find((t) => t.kind === "flow-settings");
      expect(flowTab).toEqual({
        id: "flow-settings",
        kind: "flow-settings",
        label: "Flow B",
        flowId: "flow-b",
      });
      expect(state.activeTabId).toBe("flow-settings");
    });
  });

  describe("setActiveTab", () => {
    it("sets the active tab id directly", () => {
      const state = reducer(
        { tabs: [], activeTabId: "flow-settings" },
        setActiveTab("version-settings"),
      );
      expect(state.activeTabId).toBe("version-settings");
    });
  });

  describe("closeTab", () => {
    function openTwoTabs() {
      let state = reducer(
        BASE_STATE,
        openOrFocusTab({
          kind: "flow-settings",
          label: "Flow A",
          flowId: "flow-a",
        }),
      );
      state = reducer(
        state,
        openOrFocusTab({
          kind: "version-settings",
          label: "Version 1",
          versionId: "version-1",
        }),
      );
      return state;
    }

    it("leaves activeTabId untouched when closing a non-active tab", () => {
      const opened = openTwoTabs();
      expect(opened.activeTabId).toBe("version-settings");

      const state = reducer(opened, closeTab("flow-settings"));
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe("version-settings");
    });

    it("activates the tab that shifted into the closed slot when the active tab isn't last", () => {
      const opened = openTwoTabs();
      const withActiveFirst = reducer(opened, setActiveTab("flow-settings"));

      const state = reducer(withActiveFirst, closeTab("flow-settings"));
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].kind).toBe("version-settings");
      expect(state.activeTabId).toBe("version-settings");
    });

    it("activates the new last tab when the closed active tab was last", () => {
      const opened = openTwoTabs();
      expect(opened.activeTabId).toBe("version-settings");

      const state = reducer(opened, closeTab("version-settings"));
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe("flow-settings");
    });

    it("sets activeTabId to null when closing the last remaining tab", () => {
      const state = reducer(
        {
          tabs: [
            {
              id: "flow-settings",
              kind: "flow-settings" as const,
              label: "Flow A",
              flowId: "flow-a",
            },
          ],
          activeTabId: "flow-settings",
        },
        closeTab("flow-settings"),
      );
      expect(state.tabs).toHaveLength(0);
      expect(state.activeTabId).toBeNull();
    });

    it("no-ops when closing a tab id that doesn't exist", () => {
      const opened = openTwoTabs();
      const state = reducer(opened, closeTab("does-not-exist"));
      expect(state).toEqual(opened);
    });
  });
});
