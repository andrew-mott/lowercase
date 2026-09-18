import type { EventType, EventData, AnyEvent } from "@lcase/types";
import type { EventBusPort, PublishOptions } from "@lcase/ports";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";
import { otelAttributesRegistry } from "../registries/otel-attributes.registry.js";
import { deriveTraceHeaderFields, type EmitOptions } from "./scope.js";

/**
 * Builds and validates an event without publishing.
 * A real requirement periodically in the code base - build an event,
 * but don't emit it immediately, so that order of what happens to an event
 * (pushed to a queue first, etc) can be decided independently
 */
export function buildEvent<T extends EventType>(
  type: T,
  data: EventData<T>,
  options: EmitOptions<T>,
): AnyEvent<T> {
  const attrs = otelAttributesRegistry[type];
  const traceHeaderFields = deriveTraceHeaderFields(attrs.domain, options);
  const {
    fromEvent: _fromEvent,
    traceId: _traceId,
    ...envelopeScope
  } = options;

  const event = {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    specversion: "1.0",
    traceid: traceHeaderFields.traceId,
    spanid: traceHeaderFields.spanId,
    traceparent: traceHeaderFields.traceParent,
    ...(traceHeaderFields.parentSpanId
      ? { parentspanid: traceHeaderFields.parentSpanId }
      : {}),
    ...envelopeScope,
    data,
    type,
    domain: attrs.domain,
    action: attrs.action,
    ...(attrs.entity ? { entity: attrs.entity } : {}),
    // Correct by construction the same way every existing emitter class's
    // `satisfies XEvent<T>` check is: assembled from EventMap[T]-indexed pieces, but
    // TS can't verify a generically-indexed object literal against AnyEvent<T> for an
    // unresolved T inside a function body -- a known limitation with correlated
    // generic indexed access, not a real safety gap. The safeParse call two lines
    // below is the actual, unconditional safety net, unaffected by this cast.
  } as AnyEvent<T>;

  const entry = eventSchemaRegistry[type];
  const result = entry.schema.event.safeParse(event);
  if (!result.success) {
    throw new Error(`[emit] error parsing event; ${type}; ${result.error}`);
  }
  return event;
}

/** Publishes an already-built event (see buildEvent()). */
export async function publishEvent<T extends EventType>(
  bus: EventBusPort,
  event: AnyEvent<T>,
  publishOptions?: PublishOptions,
): Promise<AnyEvent<T>> {
  // Only pass a third argument when actually given, rather than always passing an
  // explicit `undefined` -- keeps a plain `bus.publish(type, event)` call observable
  // as exactly that (e.g. to a test asserting on call arguments), matching how
  // EventBusPort.publish's own `options?` parameter is meant to be used.
  if (publishOptions) {
    await bus.publish(event.type, event, publishOptions);
  } else {
    await bus.publish(event.type, event);
  }
  return event;
}

/**
 * Build and publish one event. Origin (new trace / new span in a known trace /
 * derived from an inbound event) is selected by which optional field is present in
 * `options` -- see EmitOrigin in ./scope.js -- not by a separate call or a named
 * function per starting point.
 */
export async function emit<T extends EventType>(
  bus: EventBusPort,
  type: T,
  data: EventData<T>,
  options: EmitOptions<T>,
  publishOptions?: PublishOptions,
): Promise<AnyEvent<T>> {
  return publishEvent(bus, buildEvent(type, data, options), publishOptions);
}
