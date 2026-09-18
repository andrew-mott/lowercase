import { z } from "zod";
import type { EventType } from "@lcase/types";
import type { CloudEventContext } from "../registries/event-types.js";
import {
  actionTypes,
  domainTypes,
  entityTypes,
  eventTypes,
} from "../registries/event-types.js";

export const CloudEventContextSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    specversion: z.literal("1.0"),
    time: z.string(),
    type: z.enum(eventTypes),

    domain: z.enum(domainTypes),
    action: z.enum(actionTypes),
    entity: z.enum(entityTypes).optional(),

    traceparent: z.string(),
    tracestate: z.string().optional(),

    traceid: z.string(),
    spanid: z.string(),
    parentspanid: z.string().optional(),

    subject: z.string().optional(),
    datacontenttype: z.string().optional(),
    dataschema: z.string().optional(),
  })
  .strict() satisfies z.ZodType<CloudEventContext<EventType>>;
