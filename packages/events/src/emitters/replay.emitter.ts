import type {
  CloudScope,
  ReplayScope,
  ReplayOtelAttributesMap,
  ReplayEventType,
  ReplayEventData,
  ReplayEvent,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort } from "@lcase/ports";
import { replayOtelAttributesMap } from "../registries/replay/replay.otel.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly typed scoped emitter for engine events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class ReplayEmitter extends BaseEmitter {
  protected otel: OtelContext;
  protected replayOtelAttributesMap: ReplayOtelAttributesMap;
  #replayScope: ReplayScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & ReplayScope & CloudScope,
    private internal: boolean,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { runid } = scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#replayScope = { runid };
    this.replayOtelAttributesMap = replayOtelAttributesMap;
    this.bus = bus;
  }

  async emit<T extends ReplayEventType>(
    type: T,
    data: ReplayEventData<T>,
  ): Promise<ReplayEvent<T>> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#replayScope,
      data,
      type,
      domain: this.replayOtelAttributesMap[type].domain,
      action: this.replayOtelAttributesMap[type].action,
      ...(this.replayOtelAttributesMap[type].entity
        ? { entity: this.replayOtelAttributesMap[type].entity }
        : {}),
    } satisfies ReplayEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[replay-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event, { internal: this.internal });
    return event;
  }
}
