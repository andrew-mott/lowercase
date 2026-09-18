import type { AnyEvent, EventType } from "@lcase/types";
import type { EventSchemaRegistry } from "../registries/event-schema.registry.js";
import type { EventParserPort } from "@lcase/ports";

export class EventParser implements EventParserPort {
  constructor(private readonly registry: EventSchemaRegistry) {}
  parse<T extends EventType>(event: AnyEvent, type: T): AnyEvent<T> {
    const eventSchema = this.registry[type].schema.event;

    const result = eventSchema.safeParse(event);
    if (result.error) throw new Error(JSON.stringify(result.error, null, 2));

    return result.data as AnyEvent<T>;
  }
}
