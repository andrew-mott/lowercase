import { describe, expect, it } from "vitest";
import { managedResource, type ManagedResource } from "@lcase/assembly";
import type { PortableSqlClient } from "@lcase/db-prisma";
import type { MessageRouter } from "@lcase/message-router";
import type {
  ArtifactStorePort,
  EnginePort,
  EventBusPort,
  EventSink,
  ObservabilityTapPort,
} from "@lcase/ports";
import { assembleApiHost } from "../../src/profiles/api-host/assemble-api-host.js";

// No instance is ever read: `managedResource` holds it and hands it to hooks,
// and the hooks here ignore it. One intersection keeps a single helper usable
// for every typed slot.
type AnyInstance = PortableSqlClient &
  ArtifactStorePort &
  EventBusPort &
  EventSink &
  ObservabilityTapPort &
  EnginePort &
  MessageRouter;
const instance = {} as AnyInstance;

function recording(id: string, calls: string[]): ManagedResource<AnyInstance> {
  return managedResource(id, instance, {
    start: () => void calls.push(`start:${id}`),
    stop: () => void calls.push(`stop:${id}`),
  });
}

function input(make: (id: string) => ManagedResource<AnyInstance>) {
  return {
    sql: make("sql"),
    artifacts: make("artifacts"),
    bus: make("bus"),
    sinks: [make("sql-projection"), make("replay")],
    tap: make("tap"),
    engine: make("engine"),
    router: make("router"),
  };
}

describe("assembleApiHost", () => {
  // The list, without running anything. Worker and the limiter are absent, and
  // this is the assertion that notices if either is quietly added back: Worker
  // belongs to the other process entirely, and nothing in the system emits the
  // slot protocol the limiter serves.
  it("manages storage, the bus, the sinks, the tap, Engine and the router", async () => {
    const runtime = assembleApiHost(
      input((id) => managedResource(id, instance)),
    );

    const report = await runtime.health();

    expect(report.resources.map((r) => r.id)).toEqual([
      "sql",
      "artifacts",
      "bus",
      "sql-projection",
      "replay",
      "tap",
      "engine",
      "router",
    ]);
  });

  // The order is invisible to the compiler -- every ordering is the same type --
  // and invisible in the returned runtime, which is three closures either way.
  // Driving it is the only way to see it.
  it("starts storage first and the router last, stopping in reverse", async () => {
    const calls: string[] = [];
    const runtime = assembleApiHost(input((id) => recording(id, calls)));

    await runtime.start();
    await runtime.stop();

    // One statement read in both directions. Starting: nothing is delivered
    // until every handler and both halves of storage are running. Stopping: the
    // router goes first so intake ends, and the SQL client goes last so the
    // projections a claimed terminal produces still have somewhere to write.
    expect(calls).toEqual([
      "start:sql",
      "start:artifacts",
      "start:bus",
      "start:sql-projection",
      "start:replay",
      "start:tap",
      "start:engine",
      "start:router",
      "stop:router",
      "stop:engine",
      "stop:tap",
      "stop:replay",
      "stop:sql-projection",
      "stop:bus",
      "stop:artifacts",
      "stop:sql",
    ]);
  });
});
