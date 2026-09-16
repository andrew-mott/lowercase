import {
  hostPlanFor,
  resolveHostPlan,
  type ResolvedHostPlan,
} from "@lcase/message-topology";
import { jobCatalog } from "@lcase/message-topology/catalogs";
import {
  apiEngineObserverHost,
  remoteWorker,
} from "@lcase/message-topology/deployments";

/**
 * This host's whole view of the deployment: the `remote-worker` manifest
 * narrowed to the role that keeps the API, Engine and Observability together,
 * joined to the conversations this process imported.
 *
 * What the plan says about this host is the mirror of the Worker host's: it
 * publishes the command topic and consumes the two subscriptions that are not
 * Worker's, and it never learns who serves the commands it publishes. The two
 * agree by sharing routes rather than by naming each other.
 *
 * Kept beside the profile rather than at `src/` root, which is where the Worker
 * host keeps its equivalent. That file calls the role id "this app's identity",
 * which was true when the app hosted exactly one role. This app hosts two, so
 * the identity belongs to the host that resolves it -- the embedded host
 * resolves a different role, from a different manifest, through the profile
 * package it uses.
 */
export function apiHostPlan(): ResolvedHostPlan {
  return resolveHostPlan(
    hostPlanFor(remoteWorker, apiEngineObserverHost.id),
    jobCatalog,
  );
}
