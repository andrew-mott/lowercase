import {
  hostPlanFor,
  resolveHostPlan,
  type ResolvedHostPlan,
} from "@lcase/message-topology";
import { jobCatalog } from "@lcase/message-topology/catalogs";
import { remoteWorker, workerHost } from "@lcase/message-topology/deployments";

/**
 * This process's whole view of the deployment: the `remote-worker` manifest
 * narrowed to the Worker host's role, joined to the conversations this process
 * imported.
 *
 * The role id is this app's identity rather than configuration. Nothing here
 * is switchable -- a process that hosts something other than Worker resolves a
 * different role, and it does so from its own profile rather than from a flag
 * on this one.
 *
 * What the plan says about this host is the asymmetry the whole Arc rests on:
 * it publishes the terminal topic and consumes the Worker command
 * subscription, and never learns who reads either. Engine and Observability
 * appear nowhere in it.
 */
export function workerHostPlan(): ResolvedHostPlan {
  return resolveHostPlan(hostPlanFor(remoteWorker, workerHost.id), jobCatalog);
}
