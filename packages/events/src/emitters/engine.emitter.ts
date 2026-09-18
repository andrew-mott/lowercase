import type {
  EngineScope,
  CloudScope,
  EngineEventData,
  EngineEventType,
  EngineOtelAttributesMap,
  EngineEvent,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EngineEmitterPort, EventBusPort } from "@lcase/ports";
import { engineOtelAttributesMap } from "../otel-attributes.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly typed scoped emitter for engine events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class EngineEmitter extends BaseEmitter implements EngineEmitterPort {
  protected otel: OtelContext;
  protected engineOtelAttributes: EngineOtelAttributesMap;
  #engineScope: EngineScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & EngineScope & CloudScope,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { engineid } = scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#engineScope = { engineid };
    this.engineOtelAttributes = engineOtelAttributesMap;
    this.bus = bus;
  }

  async emit<T extends EngineEventType>(
    type: T,
    data: EngineEventData<T>,
  ): Promise<EngineEvent<T>> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#engineScope,
      data,
      type,
      domain: this.engineOtelAttributes[type].domain,
      action: this.engineOtelAttributes[type].action,
      ...(this.engineOtelAttributes[type].entity
        ? { entity: this.engineOtelAttributes[type].entity }
        : {}),
    } satisfies EngineEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[engine-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event);
    return event;
  }
}
