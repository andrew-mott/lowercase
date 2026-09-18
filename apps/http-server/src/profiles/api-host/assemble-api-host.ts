import {
  createManagedRuntime,
  type ManagedResource,
  type ManagedRuntime,
} from "@lcase/assembly";
import type {
  ArtifactStorePort,
  EnginePort,
  EventBusPort,
  EventSink,
  ObservabilityTapPort,
} from "@lcase/ports";
import type { PortableSqlClient } from "@lcase/db-prisma";
import type { MessageRouter } from "@lcase/message-router";

/**
 * Every resource this process manages.
 *
 * It is the embedded system's list without Worker and without the limiter, plus
 * the artifact store, which is managed here because an S3 store has a real
 * reachability check to run at startup where the embedded filesystem store has
 * none.
 *
 * No limiter. Nothing in the system emits `worker.slot.requested` -- the
 * protocol is declared in `@lcase/types` and served by `@lcase/limiter`, but it
 * has no producer -- so composing one here would start a component that cannot
 * be asked for anything. If it becomes live it is a conversation between two
 * processes, which makes it a catalog and a subscription rather than a resource
 * that happens to share this host's bus.
 *
 * Fields are required and typed against each resource's real port, so a caller
 * that forgets one fails to compile rather than assembling a partial process.
 */
export type ApiHostAssemblyInput = {
  sql: ManagedResource<PortableSqlClient>;
  artifacts: ManagedResource<ArtifactStorePort>;
  bus: ManagedResource<EventBusPort>;
  sinks: readonly ManagedResource<EventSink>[];
  tap: ManagedResource<ObservabilityTapPort>;
  engine: ManagedResource<EnginePort>;
  router: ManagedResource<MessageRouter>;
};

export function assembleApiHost(input: ApiHostAssemblyInput): ManagedRuntime {
  // Storage first, router last, everything that handles something in between --
  // the same statement the other two assemblers make, read in both directions.
  // Starting: nothing is delivered until every handler and both halves of
  // storage are running. Stopping, in reverse: intake ends first, so a terminal
  // already claimed is still projected, and the client those projections write
  // through is still connected when they do.
  const resources: ManagedResource<unknown>[] = [
    input.sql,
    input.artifacts,
    input.bus,
    ...input.sinks,
    input.tap,
    input.engine,
    input.router,
  ];
  return createManagedRuntime(resources);
}
