import type {
  AnyEvent,
  CapId,
  JobCompletedType,
  JobDelayedType,
  JobEvent,
  JobEventType,
  JobFailedType,
  JobQueuedType,
  JobResumedEvent,
  JobResumedType,
  JobStartedType,
  JobSubmittedEvent,
  JobSubmittedType,
} from "@lcase/types";
import {
  jobCompletedTypeSchema,
  jobDelayedTypeSchema,
  jobFailedTypeSchema,
  jobQueuedTypeSchema,
  jobResumedTypeSchema,
  jobStartedTypeSchema,
  jobSubmittedTypeSchema,
} from "../schemas/job/job.category.schema.js";
import type {
  JobCompletedParsed,
  JobDelayedParsed,
  JobFailedParsed,
  JobParserPort,
  JobQueuedParsed,
  JobStartedParsed,
} from "@lcase/ports";
import type { EventSchemaRegistry } from "../registries/event-schema.registry.js";

export class JobParser implements JobParserPort {
  constructor(private readonly eventRegistry: EventSchemaRegistry) {}

  /* type parsers */

  parseJobSubmittedType(type: string): JobSubmittedType | undefined {
    const result = jobSubmittedTypeSchema.safeParse(type);
    if (result.error) return;
    return result.data;
  }
  parseJobDelayedType(type: string): JobDelayedType | undefined {
    const result = jobDelayedTypeSchema.safeParse(type);
    if (result.error) return;
    return result.data;
  }
  parseJobResumedType(type: string): JobResumedType | undefined {
    const result = jobResumedTypeSchema.safeParse(type);
    if (result.error) return;
    return result.data;
  }
  parseJobQueuedType(type: string): JobQueuedType | undefined {
    const result = jobQueuedTypeSchema.safeParse(type);
    if (result.error) return;
    return result.data;
  }
  parseJobStartedType(type: string): JobStartedType | undefined {
    const result = jobStartedTypeSchema.safeParse(type);
    if (result.error) return;
    return result.data;
  }
  parseJobCompletedType(type: string): JobCompletedType | undefined {
    const result = jobCompletedTypeSchema.safeParse(type);
    if (result.error) return;
    return result.data;
  }
  parseJobFailedType(type: string): JobFailedType | undefined {
    const result = jobFailedTypeSchema.safeParse(type);
    if (result.error) return;
    return result.data;
  }

  /* full type and event parsers */

  parseJobSubmitted(event: AnyEvent): JobSubmittedEvent | undefined {
    const type = this.parseJobSubmittedType(event.type);
    if (!type) {
      return;
    }
    const parsedEvent = this.parseJobEvent(event as JobEvent<typeof type>);
    if (!parsedEvent) return;
    return parsedEvent;
  }
  parseJobDelayed(event: AnyEvent): JobDelayedParsed | undefined {
    const type = this.parseJobDelayedType(event.type);
    if (!type) {
      return;
    }
    const parsedEvent = this.parseJobEvent(event as JobEvent<typeof type>);
    if (!parsedEvent) return;
    const capId = this.#getCapId(type);
    return {
      type,
      capId,
      event: parsedEvent,
    };
  }
  parseJobResumed(event: AnyEvent): JobResumedEvent | undefined {
    const type = this.parseJobResumedType(event.type);
    if (!type) {
      return;
    }
    const parsedEvent = this.parseJobEvent(event as JobEvent<typeof type>);
    return parsedEvent;
  }
  parseJobQueued(event: AnyEvent): JobQueuedParsed | undefined {
    const type = this.parseJobQueuedType(event.type);
    if (!type) {
      return;
    }
    const parsedEvent = this.parseJobEvent(event as JobEvent<typeof type>);
    if (!parsedEvent) return;

    return {
      type,
      capId: parsedEvent.capid,
      event: parsedEvent,
    };
  }
  parseJobStarted(event: AnyEvent): JobStartedParsed | undefined {
    const type = this.parseJobStartedType(event.type);
    if (!type) {
      return;
    }
    const parsedEvent = this.parseJobEvent(event as JobEvent<typeof type>);
    if (!parsedEvent) return;
    return {
      type,
      capId: parsedEvent.capid,
      event: parsedEvent,
    };
  }
  parseJobCompleted(event: AnyEvent): JobCompletedParsed | undefined {
    const type = this.parseJobCompletedType(event.type);
    if (!type) {
      return;
    }
    const parsedEvent = this.parseJobEvent(event as JobEvent<typeof type>);
    if (!parsedEvent) return;

    return {
      type,
      capId: parsedEvent.capid,
      event: parsedEvent,
    };
  }
  parseJobFailed(event: AnyEvent): JobFailedParsed | undefined {
    const type = this.parseJobFailedType(event.type);
    if (!type) {
      return;
    }
    const parsedEvent = this.parseJobEvent(event as JobEvent<typeof type>);
    if (!parsedEvent) return;

    return {
      type,
      capId: parsedEvent.capid,
      event: parsedEvent,
    };
  }

  /** any job event parser */
  parseJobEvent<T extends JobEventType>(
    event: JobEvent<T>,
  ): JobEvent<T> | undefined {
    const schema = this.eventRegistry[event.type].schema.event;
    const parsedEvent = schema.safeParse(event);
    if (parsedEvent.error) {
      console.log(
        `job parse error: ${event.type}, ${event}`,
        parsedEvent.error,
      );
      return;
    }
    return parsedEvent.data;
  }

  /** utility to split and extract middle portion as capability */
  #getCapId(type: JobEventType) {
    const parts = type.split(".");
    return parts[1] as CapId;
  }
}
