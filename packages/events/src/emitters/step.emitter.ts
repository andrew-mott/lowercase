import type {
  StepEventType,
  StepEventData,
  StepScope,
  StepOtelAttributesMap,
  StepEvent,
  CloudScope,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort } from "@lcase/ports";
import { stepOtelAttributes } from "../otel-attributes.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly types scoped emitter for step events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class StepEmitter extends BaseEmitter {
  protected otel: OtelContext;
  protected stepOtelAttributes: StepOtelAttributesMap;
  #stepScope: StepScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: CloudScope & StepScope & OtelContext,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { flowid, flowversionid, runid, stepid, steptype } = scope;

    super({ traceId, spanId, traceParent }, { source });
    this.otel = { traceId, spanId, traceParent };
    this.#stepScope = { flowid, flowversionid, runid, stepid, steptype };
    this.stepOtelAttributes = stepOtelAttributes;
    this.bus = bus;
  }

  async emit<T extends StepEventType>(
    type: T,
    data: StepEventData<T>,
  ): Promise<void> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#stepScope,
      data,
      type,
      domain: this.stepOtelAttributes[type].domain,
      action: this.stepOtelAttributes[type].action,
      ...(this.stepOtelAttributes[type].entity
        ? { entity: this.stepOtelAttributes[type].entity }
        : {}),
    } satisfies StepEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[step-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event);
  }
}
