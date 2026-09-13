import {
  assertInProcessRealizable,
  type MessagingManifest,
} from "@lcase/message-topology";
import {
  localSystemInProcess,
  localSystemRedis,
} from "@lcase/message-topology/deployments";
import type { MessagingConfig } from "./config/messaging.config.js";

/**
 * Which deployment this process is running, chosen by the one config axis that
 * names a carrier.
 *
 * Lives here rather than beside the presets because which deployments a profile
 * supports is the profile's business: this one composes the embedded graph, so
 * it offers the two embedded deployments and not `remote-worker`.
 *
 * The config value is the selection input and the manifest is the authority
 * after it. They cannot disagree here -- the switch is what establishes the
 * pairing -- which is why `buildMessageRouter` asserts the two match rather
 * than choosing between them a second time.
 */
export function manifestFor(kind: MessagingConfig["kind"]): MessagingManifest {
  const manifest =
    kind === "in-process" ? localSystemInProcess : localSystemRedis;

  // Inert for both presets today, since each declares one role. It is the guard
  // for the moment a preset gains a second one: an in-process carrier would
  // then seal an object graph that silently drops every Message meant for the
  // other role, and this is the only place a manifest and a carrier choice are
  // both in scope.
  if (manifest.carrier === "in-process") {
    assertInProcessRealizable(manifest);
  }

  return manifest;
}
