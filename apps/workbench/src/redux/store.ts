import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { flowsApi } from "./api/flows-api";
import { flowsSlice } from "./slices/flows-slice";
import { routeEventListenerMiddleware } from "./middleware/route-event";
import { createSseMiddleware } from "./middleware/sse";
import { eventsSlice } from "./slices/events-slice";
import { runsApi } from "./api/runs-api";
import { simsApi } from "./api/sims-api";
import { artifactsApi } from "./api/artifacts-api";
import { evalsApi } from "./api/evals-api";
import { flowGraphPanelsSlice } from "./slices/flow-graph-panels-slice";
import { eventGraphPanelsSlice } from "./slices/event-graph-panels-slice";
import { artifactPanelsSlice } from "./slices/artifact-panels-slice";
import { artifactAuthoringPanelsSlice } from "./slices/artifact-authoring-panels-slice";
import { flowAuthoringPanelsSlice } from "./slices/flow-authoring-panels-slice";
import { loadPersistedDockState } from "@/components/workbench/dock/dock-persistence";

// reducers are separated out to type RootState independently of store,
// because middleware in the store needs RootState.  This avoids circular
// type dependencies
export const rootReducer = combineReducers({
  flows: flowsSlice.reducer,
  events: eventsSlice.reducer,
  flowGraphPanels: flowGraphPanelsSlice.reducer,
  eventGraphPanels: eventGraphPanelsSlice.reducer,
  artifactPanels: artifactPanelsSlice.reducer,
  artifactAuthoringPanels: artifactAuthoringPanelsSlice.reducer,
  flowAuthoringPanels: flowAuthoringPanelsSlice.reducer,
  [flowsApi.reducerPath]: flowsApi.reducer,
  [runsApi.reducerPath]: runsApi.reducer,
  [simsApi.reducerPath]: simsApi.reducer,
  [artifactsApi.reducerPath]: artifactsApi.reducer,
  [evalsApi.reducerPath]: evalsApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

// read synchronously at module load, before configureStore -- preloadedState
// has to be provided at construction time, so this can't happen inside any
// component. No dispatch happens here, so nothing can react to it.
const persistedDockState = loadPersistedDockState();

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: {
    flowGraphPanels: persistedDockState.flowGraphPanels ?? undefined,
    eventGraphPanels: persistedDockState.eventGraphPanels ?? undefined,
    artifactPanels: persistedDockState.artifactPanels ?? undefined,
    artifactAuthoringPanels:
      persistedDockState.artifactAuthoringPanels ?? undefined,
    flowAuthoringPanels: persistedDockState.flowAuthoringPanels ?? undefined,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .prepend(routeEventListenerMiddleware.middleware)
      .concat(
        flowsApi.middleware,
        runsApi.middleware,
        simsApi.middleware,
        artifactsApi.middleware,
        evalsApi.middleware,
        createSseMiddleware(),
      ),
});

export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
