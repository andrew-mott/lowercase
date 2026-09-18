import type {
  CloudScope,
  LimiterScope,
  LimiterOtelAttributesMap,
  LimiterEventType,
  LimiterEventData,
  LimiterEvent,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort } from "@lcase/ports";
import { limiterOtelAttributesMap } from "../registries/limiter/otel.map.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly typed scoped emitter for engine events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class LimiterEmitter extends BaseEmitter {
  protected otel: OtelContext;
  protected limiterOtelAttributesMap: LimiterOtelAttributesMap;
  #limiterScope: LimiterScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & LimiterScope & CloudScope,
    private internal: boolean = false,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { limiterid } = scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#limiterScope = { limiterid };
    this.limiterOtelAttributesMap = limiterOtelAttributesMap;
    this.bus = bus;
  }

  async emit<T extends LimiterEventType>(
    type: T,
    data: LimiterEventData<T>,
  ): Promise<LimiterEvent<T>> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#limiterScope,
      data,
      type,
      domain: this.limiterOtelAttributesMap[type].domain,
      action: this.limiterOtelAttributesMap[type].action,
      ...(this.limiterOtelAttributesMap[type].entity
        ? { entity: this.limiterOtelAttributesMap[type].entity }
        : {}),
    } satisfies LimiterEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[limiter-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event, { internal: this.internal });
    return event;
  }
}
