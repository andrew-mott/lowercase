import type {
  CloudScope,
  JobScope,
  JobOtelAttributesMap,
  JobEventType,
  JobEventData,
  JobEvent,
} from "@lcase/types";
import type { OtelContext } from "../types.js";
import { BaseEmitter } from "./base.emitter.js";
import type { EventBusPort, JobEmitterPort } from "@lcase/ports";
import { jobOtelAttributesMap } from "../otel-attributes.js";
import { eventSchemaRegistry } from "../registries/event-schema.registry.js";

/**
 * strongly typed scoped emitter for engine events.
 * @see EmitterFactory for general usage with it
 *
 * registry should move out.
 */
export class JobEmitter extends BaseEmitter implements JobEmitterPort {
  protected otel: OtelContext;
  protected jobOtelAttributesMap: JobOtelAttributesMap;
  #jobScope: JobScope;

  constructor(
    private readonly bus: EventBusPort,
    scope: OtelContext & JobScope & CloudScope,
  ) {
    const { traceId, spanId, traceParent, source } = scope;
    const { flowid, flowversionid, runid, stepid, jobid, capid, toolid } =
      scope;

    super({ traceId, spanId, traceParent }, { source });

    this.otel = { traceId, spanId, traceParent };
    this.#jobScope = {
      flowid,
      flowversionid,
      runid,
      stepid,
      jobid,
      capid,
      toolid,
    };
    this.jobOtelAttributesMap = jobOtelAttributesMap;
    this.bus = bus;
  }

  async emit<T extends JobEventType>(
    type: T,
    data: JobEventData<T>,
  ): Promise<JobEvent<T>> {
    const event = this.formEvent(type, data);

    await this.emitFormedEvent(event);
    return event;
  }
  async emitFormedEvent(event: JobEvent) {
    await this.bus.publish(event.type, event);
    return event;
  }

  formEvent<T extends JobEventType>(
    type: T,
    data: JobEventData<T>,
  ): JobEvent<T> {
    const event = {
      ...this.envelopeHeader(),
      ...this.#jobScope,
      data,
      type,
      domain: this.jobOtelAttributesMap[type].domain,
      action: this.jobOtelAttributesMap[type].action,
      ...(this.jobOtelAttributesMap[type].entity
        ? { entity: this.jobOtelAttributesMap[type].entity }
        : {}),
    } satisfies JobEvent<T>;

    const entry = eventSchemaRegistry[event.type];
    const result = entry.schema.event.safeParse(event);
    if (result.error) {
      throw new Error(
        `[job-emitter] error parsing event; ${event.type}; ${result.error}`,
      );
    }
    return event;
  }
}
