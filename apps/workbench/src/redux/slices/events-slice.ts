import type { AnyEvent } from "@lcase/types";
import {
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { eventsBatch } from "../middleware/sse";
import type { RootState } from "../store";

type EventId = string;
type RunId = string;
type EventsState = {
  ids: EventId[];
  events: Record<EventId, AnyEvent>;
  runEventIds: Record<RunId, EventId[]>;
  maxEvents: number;
};

export function hasRunId(
  event: AnyEvent,
): event is AnyEvent & { runid: string } {
  const e = event as unknown as Record<string, unknown>;
  return typeof e.runid === "string";
}
const initialState: EventsState = {
  events: {},
  ids: [],
  maxEvents: 5000,
  runEventIds: {},
};

export const eventsSlice = createSlice({
  name: "events",
  initialState,
  reducers: {
    clearAll: (state) => {
      state.events = {};
      state.ids = [];
      state.runEventIds = {};
    },
  },
  extraReducers: (builder) => {
    builder.addCase(
      eventsBatch,
      (state, action: PayloadAction<{ events: AnyEvent[] }>) => {
        // add events to state
        for (const event of action.payload.events) {
          if (state.events[event.id]) continue;
          state.events[event.id] = event;
          state.ids.push(event.id);

          if (hasRunId(event)) {
            (state.runEventIds[event.runid] ??= []).push(event.id);
          }
        }

        // trim state to sliding window
        const overflow = state.ids.length - state.maxEvents;
        if (overflow <= 0) return;

        const idsToDelete = state.ids.splice(0, overflow);
        for (const idToDelete of idsToDelete) {
          const droppedEvent = state.events[idToDelete];
          delete state.events[idToDelete];

          if (hasRunId(droppedEvent)) {
            const runIds = state.runEventIds[droppedEvent.runid];
            if (!runIds) return;
            state.runEventIds[droppedEvent.runid] = runIds.filter(
              (eventId) => eventId !== idToDelete,
            );
            if (state.runEventIds[droppedEvent.runid].length === 0) {
              delete state.runEventIds[droppedEvent.runid];
            }
          }
        }
      },
    );
  },
});

export const { clearAll } = eventsSlice.actions;

export const getEvents = (state: RootState) => {
  return state.events.events;
};

export const getRunEventIds = (state: RootState) => {
  return state.events.runEventIds;
};

// returned whenever there's no real array to give back -- a fresh `[]`
// literal on every call would defeat createSelector's memoization in
// makeSelectRunEvents below, since it can't tell "still nothing" apart from
// "something changed" without a stable reference to compare against
const EMPTY_EVENT_IDS: EventId[] = [];

export const selectRunEventIds = (state: RootState, runId: string | null) => {
  if (runId === null) return EMPTY_EVENT_IDS;
  return state.events.runEventIds[runId] ?? EMPTY_EVENT_IDS;
};

export const selectEventById = (state: RootState, id: string | null) =>
  id ? (state.events.events[id] ?? null) : null;

export const selectEventsById = (state: RootState) => state.events.events;

export const makeSelectRunEvents = () =>
  createSelector([selectRunEventIds, selectEventsById], (ids, eventsById) =>
    ids.map((id) => eventsById[id]).filter(Boolean),
  );
