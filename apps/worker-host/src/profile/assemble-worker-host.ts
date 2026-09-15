import {
  createManagedRuntime,
  type ManagedResource,
  type ManagedRuntime,
} from "@lcase/assembly";
import type { PortableSqlClient } from "@lcase/db-prisma";
import type { MessageRouter } from "@lcase/message-router";
import type { ArtifactStorePort } from "@lcase/ports";

/**
 * Every resource this process manages, which is three.
 *
 * Worker is deliberately not among them. It has no start, stop, or health of
 * its own, so wrapping it would add a resource whose lifecycle methods do
 * nothing -- a runtime reporting it healthy would be reporting on a no-op.
 *
 * Fields are required and typed against each resource's real type, so a caller
 * that forgets one fails to compile rather than assembling a partial process.
 */
export type WorkerHostAssemblyInput = {
  sql: ManagedResource<PortableSqlClient>;
  artifacts: ManagedResource<ArtifactStorePort>;
  router: ManagedResource<MessageRouter>;
};

export function assembleWorkerHost(
  input: WorkerHostAssemblyInput,
): ManagedRuntime {
  // Storage first and the router last, which is one statement read in two
  // directions. Starting: nothing is delivered until both halves of the storage
  // Worker writes through are reachable. Stopping, in reverse: intake ends
  // before that storage goes away, so a job already in flight can still finish
  // its writes.
  //
  // SQL before artifacts is arbitrary -- neither needs the other, and the
  // artifact store has a start hook but no stop. What is not arbitrary is that
  // both precede the router.
  const resources: ManagedResource<unknown>[] = [
    input.sql,
    input.artifacts,
    input.router,
  ];
  return createManagedRuntime(resources);
}
