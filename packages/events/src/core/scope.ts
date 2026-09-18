import type { AnyEvent, EventType, ScopeFor, CloudScope } from "@lcase/types";
import {
  generateTraceId,
  generateRandomSpanId,
  makeTraceParent,
} from "./trace.js";
import { deriveSpanFor } from "./span.js";

// Origin is selected by which of these fields is present, not by a separate call or
// named function -- `fromEvent?: undefined`/`traceId?: undefined` (present-but-must-
// be-undefined, not merely absent) is what makes the three branches genuinely mutually
// exclusive for a caller passing a plain object literal, with no discriminant tag.
export type EmitOrigin =
  | { fromEvent?: undefined; traceId?: undefined } // new trace
  | { fromEvent: AnyEvent; traceId?: undefined } // derived from an inbound event
  | { fromEvent?: undefined; traceId: string }; // new span in a known trace

export type EmitOptions<T extends EventType> = ScopeFor<T> &
  CloudScope &
  EmitOrigin;

export type ResolvedTraceHeaderFields = {
  traceId: string;
  spanId: string;
  traceParent: string;
  parentSpanId?: string;
};

export function deriveTraceHeaderFields<T extends EventType>(
  domain: string,
  options: EmitOptions<T>,
): ResolvedTraceHeaderFields {
  const traceId = options.fromEvent
    ? options.fromEvent.traceid
    : (options.traceId ?? generateTraceId());

  const derived = deriveSpanFor(domain, options);
  const spanId = derived?.spanId ?? generateRandomSpanId();
  const parentSpanId = derived?.parentSpanId;

  return {
    traceId,
    spanId,
    traceParent: makeTraceParent(traceId, spanId),
    ...(parentSpanId ? { parentSpanId } : {}),
  };
}
