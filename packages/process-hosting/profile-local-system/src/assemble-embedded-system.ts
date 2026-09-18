import {
  createManagedRuntime,
  type ManagedResource,
  type ManagedRuntime,
} from "@lcase/assembly";
import type {
  EventBusPort,
  EventSink,
  EnginePort,
  LimiterPort,
  ObservabilityTapPort,
} from "@lcase/ports";
import type { PortableSqlClient } from "@lcase/db-prisma";
import type { MessageRouter } from "@lcase/message-router";

// Generalizes WorkflowRuntime's hardcoded router->sinks->tap->engine->limiter
// sequence (packages/runtime/src/workflow.runtime.ts, now deleted), with bus
// folded in as the base dependency -- started first, stopped last --
// resolving that code's old drift (limiter.stop() was never called; bus had
// no start() counterpart at all) via one symmetric start/reverse-stop policy.
// `router` dropped from that sequence once `NodeRouter`/`QueuePort` were
// confirmed fully dead (swappable-infrastructure the related change) -- bus->sinks->tap->
// engine->limiter is the sequence now.
//
// Every field is required -- completeness is enforced by TypeScript here,
// not by a raw config type: a caller missing e.g. `limiter` fails to
// typecheck, it does not silently assemble an incomplete system. Fields are
// typed against each resource's real port (not `ManagedResource<unknown>`)
// now that the related change has a real caller to confirm this doesn't force awkward
// casting.
export type EmbeddedSystemAssemblyInput = {
  sql: ManagedResource<PortableSqlClient>;
  bus: ManagedResource<EventBusPort>;
  sinks: readonly ManagedResource<EventSink>[];
  tap: ManagedResource<ObservabilityTapPort>;
  engine: ManagedResource<EnginePort>;
  limiter: ManagedResource<LimiterPort>;
  router: ManagedResource<MessageRouter>;
};

export function assembleEmbeddedSystem(
  input: EmbeddedSystemAssemblyInput,
): ManagedRuntime {
  // Router last, which is the mirror of bus first: start order means nothing
  // is delivered until every component that handles a Message is running, and
  // reverse-stop order means intake ends before any of them stops. A carrier
  // that starts early would deliver into a component that has not started.
  //
  // SQL sits ahead of the bus for the same reason in the other direction: the
  // projection sinks write through that client, and reverse-stop order is what
  // keeps it connected until after they have stopped.
  const resources: ManagedResource<unknown>[] = [
    input.sql,
    input.bus,
    ...input.sinks,
    input.tap,
    input.engine,
    input.limiter,
    input.router,
  ];
  return createManagedRuntime(resources);
}
