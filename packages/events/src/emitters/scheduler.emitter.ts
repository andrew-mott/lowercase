import type {
  CloudScope,
  SchedulerScope,
  SchedulerOtelAttributesMap,
  SchedulerEventType,
  SchedulerEventData,
  SchedulerEvent,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort } from "@lcase/ports";
import { schedulerOtelAttributesMap } from "../registries/scheduler/otel.map.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly typed scoped emitter for engine events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class SchedulerEmitter extends BaseEmitter {
  protected otel: OtelContext;
  protected schedulerOtelAttributesMap: SchedulerOtelAttributesMap;
  #schedulerScope: SchedulerScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & SchedulerScope & CloudScope,
    private internal: boolean = false,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { schedulerid } = scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#schedulerScope = { schedulerid };
    this.schedulerOtelAttributesMap = schedulerOtelAttributesMap;
    this.bus = bus;
  }

  async emit<T extends SchedulerEventType>(
    type: T,
    data: SchedulerEventData<T>,
  ): Promise<SchedulerEvent<T>> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#schedulerScope,
      data,
      type,
      domain: this.schedulerOtelAttributesMap[type].domain,
      action: this.schedulerOtelAttributesMap[type].action,
      ...(this.schedulerOtelAttributesMap[type].entity
        ? { entity: this.schedulerOtelAttributesMap[type].entity }
        : {}),
    } satisfies SchedulerEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[scheduler-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event, { internal: this.internal });
    return event;
  }
}
