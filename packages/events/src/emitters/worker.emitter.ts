import type {
  CloudScope,
  WorkerScope,
  WorkerOtelAttributesMap,
  WorkerEventType,
  WorkerEventData,
  WorkerEvent,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort } from "@lcase/ports";
import { workerOtelAttributesMap } from "../otel-attributes.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly typed scoped emitter for engine events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class WorkerEmitter extends BaseEmitter {
  protected otel: OtelContext;
  protected workerOtelAttributesMap: WorkerOtelAttributesMap;
  #workerScope: WorkerScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & WorkerScope & CloudScope,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { workerid } = scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#workerScope = { workerid };
    this.workerOtelAttributesMap = workerOtelAttributesMap;
    this.bus = bus;
  }

  async emit<T extends WorkerEventType>(
    type: T,
    data: WorkerEventData<T>,
  ): Promise<void> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#workerScope,
      data,
      type,
      domain: this.workerOtelAttributesMap[type].domain,
      action: this.workerOtelAttributesMap[type].action,
      ...(this.workerOtelAttributesMap[type].entity
        ? { entity: this.workerOtelAttributesMap[type].entity }
        : {}),
    } satisfies WorkerEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[worker-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event);
  }
}
