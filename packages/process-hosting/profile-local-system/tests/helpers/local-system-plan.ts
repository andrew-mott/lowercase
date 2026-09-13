import { hostPlanFor, resolveHostPlan } from "@lcase/message-topology";
import { jobCatalog } from "@lcase/message-topology/catalogs";
import { localSystemRole } from "@lcase/message-topology/deployments";
import { manifestFor } from "../../src/select-manifest.js";
import type { MessagingConfig } from "../../src/config/messaging.config.js";

/**
 * The plan this profile derives at startup, built by the same chain rather than
 * hand-written, so a test binds against exactly what production binds against.
 */
export function localSystemPlan(kind: MessagingConfig["kind"] = "in-process") {
  return resolveHostPlan(
    hostPlanFor(manifestFor(kind), localSystemRole.id),
    jobCatalog,
  );
}
