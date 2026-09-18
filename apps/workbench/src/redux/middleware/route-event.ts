import type { AnyEvent } from "@lcase/types";
import { createListenerMiddleware, type Dispatch } from "@reduxjs/toolkit";
import { eventsBatch } from "./sse";

export const routeEventListenerMiddleware = createListenerMiddleware();

export function routeEvent(_dispatch: Dispatch, event: AnyEvent) {
  switch (event.type) {
    case "run.started": {
      // no custom dispatching yet
      return;
    }
    default:
      return;
  }
}

/**
 * start listening and routing events as they come in from the buffer
 */
routeEventListenerMiddleware.startListening({
  actionCreator: eventsBatch,
  effect: async (action, api) => {
    for (const event of action.payload.events) {
      routeEvent(api.dispatch, event);
    }
  },
});
