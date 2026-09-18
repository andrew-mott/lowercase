import { describe, expect, it } from "vitest";
import { managedResource, type ManagedResource } from "@lcase/assembly";
import type { PortableSqlClient } from "@lcase/db-prisma";
import type { MessageRouter } from "@lcase/message-router";
import type { ArtifactStorePort } from "@lcase/ports";
import { assembleWorkerHost } from "../src/profile/assemble-worker-host.js";

// No instance is ever read: `managedResource` holds it and passes it to hooks,
// and the hooks here are either absent or ignore it. One intersection keeps a
// single helper usable for every typed slot.
type AnyInstance = PortableSqlClient & ArtifactStorePort & MessageRouter;
const instance = {} as AnyInstance;

function recording(id: string, calls: string[]): ManagedResource<AnyInstance> {
  return managedResource(id, instance, {
    start: () => void calls.push(`start:${id}`),
    stop: () => void calls.push(`stop:${id}`),
  });
}

describe("assembleWorkerHost", () => {
  // The list, without running anything: `health()` reports one entry per
  // managed resource, so it answers "which" while start/stop answer "in what
  // order".
  //
  // Worker is absent on purpose -- it has no start, stop or health of its own,
  // and a no-op resource would let the runtime report a component healthy on
  // the strength of hooks that do nothing. The artifact store is absent because
  // `S3ArtifactStore` holds its client privately and exposes no teardown. This
  // is the assertion that notices if either of those is quietly reversed.
  it("manages exactly the sql client and the router", async () => {
    const runtime = assembleWorkerHost({
      sql: managedResource("sql", instance),
      artifacts: managedResource("artifacts", instance),
      router: managedResource("router", instance),
    });

    const report = await runtime.health();

    expect(report.resources.map((r) => r.id)).toEqual([
      "sql",
      "artifacts",
      "router",
    ]);
  });

  // The order is invisible to the compiler -- both orderings are the same type
  // -- and invisible in the returned runtime, which is three closures either
  // way. Driving it is the only way to see it, which means this test exercises
  // `@lcase/assembly`'s start/stop machinery too. That is accepted rather than
  // avoided: the sequence only exists in the thing that consumes it.
  it("starts storage before the router and stops them in reverse", async () => {
    const calls: string[] = [];
    const runtime = assembleWorkerHost({
      sql: recording("sql", calls),
      artifacts: recording("artifacts", calls),
      router: recording("router", calls),
    });

    await runtime.start();
    await runtime.stop();

    // Read in both directions from one list. Starting: nothing is delivered
    // until both halves of the storage Worker writes through are reachable.
    // Stopping: intake ends before that storage goes away, so a job already in
    // flight still has somewhere to finish into.
    expect(calls).toEqual([
      "start:sql",
      "start:artifacts",
      "start:router",
      "stop:router",
      "stop:artifacts",
      "stop:sql",
    ]);
  });
});
