import { vi } from "vitest";
import type { WorkerLifecycleEvent } from "../../src/worker-lifecycle.events.js";
import type { WorkerLifecycleEventSink } from "../../src/ports/outbound/worker-event-sink.port.js";

// Properly-typed WorkerLifecycleEventSink mock -- no cast needed, `sink`
// genuinely implements the real port.
export function createFakeLifecycleSink() {
  const events: WorkerLifecycleEvent[] = [];
  const record = vi.fn(async (event: WorkerLifecycleEvent) => {
    events.push(event);
  });
  const sink: WorkerLifecycleEventSink = { record };
  return { sink, record, events };
}
