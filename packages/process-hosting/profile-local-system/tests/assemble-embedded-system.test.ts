import { describe, expect, it } from "vitest";
import type { ManagedResource } from "@lcase/assembly";
import {
  assembleEmbeddedSystem,
  type EmbeddedSystemAssemblyInput,
} from "../src/assemble-embedded-system.js";

function testResource<T = unknown>(
  id: string,
  callOrder: string[],
  opts: { failStart?: boolean; unhealthy?: string } = {},
): ManagedResource<T> {
  return {
    id,
    // These doubles only exercise start/stop ordering and health, so the
    // instance is never read -- the cast keeps one helper usable for every
    // typed slot instead of inventing a fake per port.
    instance: undefined as T,
    async start() {
      if (opts.failStart) throw new Error(`${id} failed to start`);
      callOrder.push(`start:${id}`);
    },
    async stop() {
      callOrder.push(`stop:${id}`);
    },
    async health() {
      return opts.unhealthy
        ? { status: "unhealthy" as const, reason: opts.unhealthy }
        : { status: "healthy" as const };
    },
  };
}

function testInput(
  callOrder: string[],
  overrides: Partial<EmbeddedSystemAssemblyInput> = {},
): EmbeddedSystemAssemblyInput {
  return {
    sql: overrides.sql ?? testResource("sql", callOrder),
    bus: overrides.bus ?? testResource("bus", callOrder),
    sinks: [testResource("sink1", callOrder), testResource("sink2", callOrder)],
    tap: overrides.tap ?? testResource("tap", callOrder),
    engine: overrides.engine ?? testResource("engine", callOrder),
    limiter: overrides.limiter ?? testResource("limiter", callOrder),
    router: overrides.router ?? testResource("router", callOrder),
  };
}

describe("assembleEmbeddedSystem", () => {
  it("starts resources in fixed order: sql, bus, sinks, tap, engine, limiter, router", async () => {
    const callOrder: string[] = [];
    const runtime = assembleEmbeddedSystem(testInput(callOrder));

    await runtime.start();

    expect(callOrder).toEqual([
      // SQL first, so the projection sinks never start against a client that
      // has not connected.
      "start:sql",
      "start:bus",
      "start:sink1",
      "start:sink2",
      "start:tap",
      "start:engine",
      "start:limiter",
      // Router last: a carrier that started earlier would deliver into a
      // component that has not started yet.
      "start:router",
    ]);
  });

  it("stops resources in exact reverse order", async () => {
    const callOrder: string[] = [];
    const runtime = assembleEmbeddedSystem(testInput(callOrder));

    await runtime.start();
    callOrder.length = 0;
    await runtime.stop();

    expect(callOrder).toEqual([
      // Router first, so intake stops before any component handling a
      // Message does.
      "stop:router",
      "stop:limiter",
      "stop:engine",
      "stop:tap",
      "stop:sink2",
      "stop:sink1",
      "stop:bus",
      "stop:sql",
    ]);
  });

  it("rolls back at the assembled-runtime level when a resource fails to start", async () => {
    const callOrder: string[] = [];
    const input = testInput(callOrder, {
      engine: testResource("engine", callOrder, { failStart: true }),
    });
    const runtime = assembleEmbeddedSystem(input);

    const outcome = await runtime.start();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.failedResourceId).toBe("engine");
    // Everything started before `engine` gets rolled back; `limiter` and
    // `router` never start.
    expect(callOrder).toEqual([
      "start:sql",
      "start:bus",
      "start:sink1",
      "start:sink2",
      "start:tap",
      "stop:tap",
      "stop:sink2",
      "stop:sink1",
      "stop:bus",
      "stop:sql",
    ]);
  });

  it("returns a defined failure rather than double-starting on a second start() call", async () => {
    const callOrder: string[] = [];
    const runtime = assembleEmbeddedSystem(testInput(callOrder));

    await runtime.start();
    const secondOutcome = await runtime.start();

    expect(secondOutcome.ok).toBe(false);
    if (secondOutcome.ok) throw new Error("expected failure");
    expect(secondOutcome.error).toBe("already running");
    // No resource's start() was invoked a second time.
    expect(callOrder.filter((c) => c === "start:bus")).toHaveLength(1);
  });

  it("aggregates health across all resources", async () => {
    const callOrder: string[] = [];
    const healthyInput = testInput(callOrder);
    const healthyRuntime = assembleEmbeddedSystem(healthyInput);
    await expect(healthyRuntime.health()).resolves.toMatchObject({
      status: "healthy",
    });

    const unhealthyInput = testInput(callOrder, {
      tap: testResource("tap", callOrder, { unhealthy: "disconnected" }),
    });
    const unhealthyRuntime = assembleEmbeddedSystem(unhealthyInput);
    const report = await unhealthyRuntime.health();

    expect(report.status).toBe("unhealthy");
    expect(report.resources).toContainEqual({
      id: "tap",
      health: { status: "unhealthy", reason: "disconnected" },
    });
  });

  it("throws synchronously on duplicate resource ids, before start() is ever called", () => {
    const callOrder: string[] = [];
    const input = testInput(callOrder, {
      tap: testResource("engine", callOrder), // collides with the `engine` field's id
    });

    expect(() => assembleEmbeddedSystem(input)).toThrow(
      /duplicate managed resource id/,
    );
    expect(callOrder).toEqual([]);
  });
});
