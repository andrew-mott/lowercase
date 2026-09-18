import type { AnyEvent } from "@lcase/types";

type RunScopedEvent = AnyEvent & { runid: string };

/**
 * Used to quickly see if an event is a RunScopedEvent type or not, meaning it
 * has a runid in its payload.  Also helps narrow it to that type for TypeScript
 * ahead of runtime.
 * @param event AnyEvent
 * @returns true if the event has a run id, with type narrowing as a RunScopedEvent
 */
export function hasRunId(event: AnyEvent): event is RunScopedEvent {
  const e = event as unknown as Record<string, unknown>;
  return typeof e.runid === "string";
}
