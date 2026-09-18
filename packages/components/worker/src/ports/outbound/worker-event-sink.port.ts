import type { WorkerLifecycleEvent } from "../../worker-lifecycle.events.js";

export interface WorkerLifecycleEventSink {
  record(event: WorkerLifecycleEvent): Promise<void>;
}
