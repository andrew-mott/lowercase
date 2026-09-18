import {
  createHttpJsonExecutor,
  createLocalResourcePermit,
  Worker,
  type WorkerDeps,
} from "@lcase/worker";
import type { WorkerUserConfig } from "@lcase/types";

// Component identity is composition's to decide, not the component's, so the
// source Worker stamps on its outbound Messages is supplied from here. The same
// value the embedded profile uses: it names the component, not the process, and
// Engine cares that a terminal came from a Worker rather than which one.
const WORKER_SOURCE = "lowercase://worker";

/**
 * The collaborators this host supplies rather than letting Worker pick.
 *
 * `lifecycle` is one of them, unlike in the embedded profile where the console
 * sink is constructed inside. Nothing here wants a different sink today -- there
 * is only the one placeholder implementation -- but constructing it inside is
 * what would force the next host to write a third copy of this function.
 *
 * Taken as a `Pick` of `WorkerDeps` so it cannot drift from what Worker
 * requires. Worker builds its own capacity and JobRunner, so composition cannot
 * hand it something that bypasses either.
 */
export type BuildWorkerDeps = Pick<
  WorkerDeps,
  "artifacts" | "terminal" | "lifecycle"
>;

export function buildWorker(
  deps: BuildWorkerDeps,
  config: WorkerUserConfig,
): Worker {
  return new Worker(
    {
      ...deps,
      permits: createLocalResourcePermit({
        maxConcurrencyPerKey: config.maxConcurrencyPerKey,
      }),
      protocol: createHttpJsonExecutor({ fetch }),
    },
    {
      maxConcurrentJobs: config.maxConcurrentJobs,
      protocolTimeoutMs: config.protocolTimeoutMs,
      source: WORKER_SOURCE,
    },
  );
}
