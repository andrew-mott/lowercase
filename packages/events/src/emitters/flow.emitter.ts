import type {
  FlowEventType,
  FlowEventData,
  FlowOtelAttributesMap,
  FlowScope,
  CloudScope,
  FlowEvent,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort, FlowEmitterPort } from "@lcase/ports";
import { flowOtelAttributes } from "../otel-attributes.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly types scoped emitter for step events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out eventually
 */
export class FlowEmitter extends BaseEmitter implements FlowEmitterPort {
  protected otel: OtelContext;
  protected flowOtelAttributes: FlowOtelAttributesMap;
  #flowScope: FlowScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & FlowScope & CloudScope,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { flowid, flowversionid, runid } = scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#flowScope = { flowid, flowversionid, runid };
    this.flowOtelAttributes = flowOtelAttributes;
    this.bus = bus;
  }

  async emit<T extends FlowEventType>(
    type: T,
    data: FlowEventData<T>,
  ): Promise<FlowEvent<T>> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#flowScope,
      data,
      type,
      domain: this.flowOtelAttributes[type].domain,
      action: this.flowOtelAttributes[type].action,
      ...(this.flowOtelAttributes[type].entity
        ? { entity: this.flowOtelAttributes[type].entity }
        : {}),
    } satisfies FlowEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[flow-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event);
    return event;
  }
}
