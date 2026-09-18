import type { ArtifactReadWritePort, MessagePublisher } from "@lcase/ports";
import {
  createConsoleWorkerLifecycleEventSink,
  createHttpJsonExecutor,
  createLocalResourcePermit,
  Worker,
} from "@lcase/worker";
import type { WorkerUserConfig } from "@lcase/types";
import type { JobTerminalType } from "@lcase/message-topology/catalogs";

// Component identity is composition's to decide, not the component's, so the
// source worker stamps on its outbound Messages is supplied from here.
const WORKER_SOURCE = "lowercase://worker";

export type BuildWorkerDeps = {
  artifacts: ArtifactReadWritePort;
  terminal: MessagePublisher<JobTerminalType>;
};

// Composition only: build the collaborators worker needs from the outside --
// local resource permits, the lifecycle sink, the protocol executor -- and
// return the actual Worker. Worker's own internals (capacity, JobRunner) are
// built by Worker, so runtime cannot compose one that bypasses either.
export function buildWorker(
  deps: BuildWorkerDeps,
  config: WorkerUserConfig,
): Worker {
  const permits = createLocalResourcePermit({
    maxConcurrencyPerKey: config.maxConcurrencyPerKey,
  });
  const lifecycle = createConsoleWorkerLifecycleEventSink();
  const protocol = createHttpJsonExecutor({ fetch });

  return new Worker(
    {
      permits,
      lifecycle,
      protocol,
      artifacts: deps.artifacts,
      terminal: deps.terminal,
    },
    {
      maxConcurrentJobs: config.maxConcurrentJobs,
      protocolTimeoutMs: config.protocolTimeoutMs,
      source: WORKER_SOURCE,
    },
  );
}
