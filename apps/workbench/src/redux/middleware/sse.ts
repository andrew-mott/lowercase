import { createAction, type Middleware } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import type { AnyEvent } from "@lcase/types";

export const sseConnect = createAction<{ url: string }>("sse/connect");
export const sseDisconnect = createAction("sse/disconnect");

export const eventsBatch = createAction<{ events: AnyEvent[] }>("events/batch");

type DispatchEventsBatch = (action: ReturnType<typeof eventsBatch>) => unknown;

// EventSource reconnects automatically per spec on a dropped/failed
// connection -- no manual retry/backoff logic needed here. The one failure
// mode it won't retry (a fatal close from a non-2xx response) isn't
// reachable today: /events has no auth or conditional rejection logic that
// could ever produce one.
export const createSseMiddleware = (): Middleware<unknown, RootState> => {
  let source: EventSource | null = null;
  let buffer: AnyEvent[] = [];
  let rafScheduled = false;

  const scheduleFlush = (dispatch: DispatchEventsBatch) => {
    if (rafScheduled) return;
    rafScheduled = true;

    requestAnimationFrame(() => {
      rafScheduled = false;
      if (buffer.length === 0) return;
      const batch = buffer;
      buffer = [];
      dispatch(eventsBatch({ events: batch }));
    });
  };

  return (store) => (next) => (action) => {
    if (sseConnect.match(action)) {
      if (source) return next(action);
      const { url } = action.payload;

      source = new EventSource(url);
      source.onopen = () => console.log("[sse] connection open");
      source.onerror = () => console.log("[sse] connection error, retrying");

      source.onmessage = (e) => {
        const event = parseEvent(e.data);

        if (!event) return;
        buffer.push(event);
        // limit buffer size to 5000 as a safeguard for memory purposes.
        // slides a window to the latest 5000 messages
        if (buffer.length > 5000) buffer.splice(0, buffer.length - 5000);
        scheduleFlush(store.dispatch);
      };
    }

    if (sseDisconnect.match(action)) {
      if (source) source.close();
      source = null;
      rafScheduled = false;
    }
    return next(action);
  };
};

/**
 * Helper function to parse event envelopes.  Just parses JSON, does not
 * implement zod yet.
 * @param json JSON string
 * @returns AnyEvent or null
 */

function parseEvent(json: string): AnyEvent | null {
  try {
    const data = JSON.parse(json);
    return data as AnyEvent;
  } catch {
    return null;
  }
}
