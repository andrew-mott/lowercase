import type { MessageRouter } from "@lcase/message-router";
import {
  engineJobTerminalSubscription,
  observabilityJobSubscription,
} from "@lcase/message-topology/catalogs";
// The concrete components rather than their ports: `handleJobTerminal` and
// `ingest` are Message-boundary methods, and neither `EnginePort` nor
// `ObservabilityTapPort` declares one. The Worker host's binder takes `Worker`
// for the same reason.
import type { Engine } from "@lcase/engine";
import type { ObservabilityTap } from "@lcase/observability";

/**
 * Every subscription this host binds, which is two: Engine's terminal
 * subscription and Observability's. Worker's command subscription belongs to
 * the other process and binding it here would fail rather than quietly take
 * work away from it -- the router rejects a binding this role's plan does not
 * contain, and sealing rejects a declared subscription nobody bound.
 */
export function bindSubscriptions(
  router: MessageRouter,
  engine: Engine,
  tap: ObservabilityTap,
): void {
  router.bind({
    subscription: engineJobTerminalSubscription,
    handler: engine.handleJobTerminal,
  });
  router.bind({
    subscription: observabilityJobSubscription,
    // One binding across both topics, so the command and the terminal it
    // produced reach the tap through one lane in the order they arrived rather
    // than racing in two. A closure only to keep `ingest` bound to its tap --
    // it owns no policy, state, or translation of its own.
    handler: (message) => tap.ingest(message),
    // Explicit rather than left to the default, because this is the half of the
    // ordering guarantee that lives here. The deployment routes both topics
    // onto one path, which is what makes arrival order meaningful; running one
    // handler at a time is what carries that order into the tap. Raising this
    // would keep the arrival order and lose the observed one.
    maxInFlight: 1,
  });
}
