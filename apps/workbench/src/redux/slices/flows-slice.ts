import type { FlowListItem } from "@lcase/types";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store.js";

export type FlowsState = {
  indexes: FlowListItem[];
};

const initialState: FlowsState = {
  indexes: [],
};

export const flowsSlice = createSlice({
  name: "flows",
  initialState,
  reducers: {
    add: (state, action: PayloadAction<FlowListItem>) => {
      state.indexes.push(action.payload);
    },
  },
});

export const { add } = flowsSlice.actions;
export const selectFlows = (state: RootState) => {
  return state.flows.indexes;
};
