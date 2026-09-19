import type { MessageRouter } from "@lcase/message-router";
import { workerJobCommandSubscription } from "@lcase/message-topology/catalogs";
import type { Worker } from "@lcase/worker";
import type { WorkerUserConfig } from "@lcase/types";

/**
 * Every subscription this host binds, which is one: the Worker command
 * subscription and nothing else.
 *
 * Binding is not left to convention. The router rejects a binding this role's
 * plan does not contain, and sealing rejects a declared subscription nobody
 * bound, so a host that quietly took on Engine's or Observability's work would
 * fail to start rather than run.
 */
export function bindSubscriptions(
  router: MessageRouter,
  worker: Worker,
  config: WorkerUserConfig,
): void {
  router.bind({
    subscription: workerJobCommandSubscription,
    handler: worker.handleJobSubmitted,
    // Worker's own capacity bound still applies underneath this. The two are
    // not redundant: this bounds what one mailbox presents, and Worker's bounds
    // the component however work arrives.
    maxInFlight: config.maxConcurrentJobs,
  });
}
