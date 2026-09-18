import type {
  CloudScope,
  ToolScope,
  ToolEventType,
  ToolEventData,
  ToolEvent,
  ToolOtelAttributesMap,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort } from "@lcase/ports";
import { toolOtelAttributesMap } from "../otel-attributes.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly typed scoped emitter for engine events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class ToolEmitter extends BaseEmitter {
  protected otel: OtelContext;
  protected toolOtelAttributesMap: ToolOtelAttributesMap;
  #toolScope: ToolScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & ToolScope & CloudScope,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { flowid, flowversionid, runid, stepid, jobid, capid, toolid } =
      scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#toolScope = {
      flowid,
      flowversionid,
      runid,
      stepid,
      jobid,
      capid,
      toolid,
    };
    this.toolOtelAttributesMap = toolOtelAttributesMap;
    this.bus = bus;
  }

  async emit<T extends ToolEventType>(
    type: T,
    data: ToolEventData<T>,
  ): Promise<ToolEvent<T>> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#toolScope,
      data,
      type,
      domain: this.toolOtelAttributesMap[type].domain,
      action: this.toolOtelAttributesMap[type].action,
      ...(this.toolOtelAttributesMap[type].entity
        ? { entity: this.toolOtelAttributesMap[type].entity }
        : {}),
    } satisfies ToolEvent<T>;

    const entry = eventSchemaRegistry[type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[tool-emitter] error parsing event; ${type}; ${result.error}`,
      );
    }
    await this.bus.publish(type, event);
    return event;
  }
}
