import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Flow and Version rows themselves never open a tab (click always just
// toggles expand) -- only their fixed leaf children do.
export type ExplorerTabEntry =
  | { id: string; kind: "flow-settings"; label: string; flowId: string }
  | {
      id: string;
      kind: "version-settings";
      label: string;
      versionId: string;
    }
  | { id: string; kind: "json-definition"; label: string; versionId: string }
  | { id: string; kind: "flow-graph"; label: string; versionId: string };

// plain `Omit<ExplorerTabEntry, "id">` doesn't distribute over the union --
// keyof a union only includes fields common to every member, so it would
// collapse to just `{ kind; label }`, losing flowId/versionId entirely.
// This conditional form forces per-member distribution instead.
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type OpenTabRequest = DistributiveOmit<ExplorerTabEntry, "id">;

type ExplorerTabsState = {
  tabs: ExplorerTabEntry[];
  activeTabId: string | null;
};

const initialState: ExplorerTabsState = {
  tabs: [],
  activeTabId: null,
};

export const explorerTabsSlice = createSlice({
  name: "explorerTabs",
  initialState,
  reducers: {
    openOrFocusTab: (state, action: PayloadAction<OpenTabRequest>) => {
      const existing = state.tabs.find(
        (tab) => tab.kind === action.payload.kind,
      );
      if (existing) {
        Object.assign(existing, action.payload);
        state.activeTabId = existing.id;
        return;
      }
      // id doubles as kind for now (one tab per kind) -- kept as its own
      // field so relaxing "one per kind" later is a reducer-logic change,
      // not a storage migration
      const id = action.payload.kind;
      state.tabs.push({ ...action.payload, id } as ExplorerTabEntry);
      state.activeTabId = id;
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTabId = action.payload;
    },
    closeTab: (state, action: PayloadAction<string>) => {
      const idx = state.tabs.findIndex((tab) => tab.id === action.payload);
      if (idx === -1) return;
      const wasActive = state.activeTabId === action.payload;
      state.tabs.splice(idx, 1);
      if (!wasActive) return;
      if (idx < state.tabs.length) {
        // the tab that shifted into the closed slot
        state.activeTabId = state.tabs[idx].id;
      } else if (state.tabs.length > 0) {
        state.activeTabId = state.tabs[state.tabs.length - 1].id;
      } else {
        state.activeTabId = null;
      }
    },
  },
});

export const { openOrFocusTab, setActiveTab, closeTab } =
  explorerTabsSlice.actions;
