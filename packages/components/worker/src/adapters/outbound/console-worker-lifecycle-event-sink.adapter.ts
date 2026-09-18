import type { WorkerLifecycleEventSink } from "../../ports/outbound/worker-event-sink.port.js";

// Explicit placeholder: no durable WorkerLifecycleEventSink adapter exists
// yet (out of scope per Phase 1's Reliability Boundary -- a durable
// implementation is a later adapter swap, not a rewrite), but production
// wiring needs a real, non-fake sink to run createWorker against outside
// tests. Replace this, don't build on it.
export function createConsoleWorkerLifecycleEventSink(): WorkerLifecycleEventSink {
  return {
    async record(event) {
      console.log("[worker-lifecycle]", JSON.stringify(event));
    },
  };
}
