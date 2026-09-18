import { describe, expect, it } from "vitest";
import type { ManagedResource } from "../src/managed-resource.js";
import { startAll, stopAll } from "../src/lifecycle.js";

// Minimal ManagedResource<T> literal, not built through managedResource() --
// these tests exercise startAll/stopAll's sequencing directly, so the
// resources themselves just need to satisfy the shape and record calls.
function testResource(
  id: string,
  callOrder: string[],
  opts: { failStart?: boolean; failStop?: boolean } = {},
): ManagedResource<unknown> {
  return {
    id,
    instance: undefined,
    async start() {
      if (opts.failStart) throw new Error(`${id} failed to start`);
      callOrder.push(`start:${id}`);
    },
    async stop() {
      callOrder.push(`stop:${id}`);
      if (opts.failStop) throw new Error(`${id} failed to stop`);
    },
    async health() {
      return { status: "healthy" };
    },
  };
}

describe("startAll", () => {
  it("starts resources in array order", async () => {
    const callOrder: string[] = [];
    const resources = [
      testResource("a", callOrder),
      testResource("b", callOrder),
      testResource("c", callOrder),
    ];

    const outcome = await startAll(resources);

    expect(outcome.ok).toBe(true);
    expect(callOrder).toEqual(["start:a", "start:b", "start:c"]);
  });

  it("rolls back already-started resources in reverse order on a mid-sequence failure", async () => {
    const callOrder: string[] = [];
    const resources = [
      testResource("a", callOrder),
      testResource("b", callOrder),
      testResource("c", callOrder, { failStart: true }),
      testResource("d", callOrder),
    ];

    const outcome = await startAll(resources);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.failedResourceId).toBe("c");
    expect(outcome.error).toBe("c failed to start");
    // d never started; a and b get rolled back in reverse order.
    expect(callOrder).toEqual(["start:a", "start:b", "stop:b", "stop:a"]);
    expect(outcome.rollback.ok).toBe(true);
  });

  it("continues rolling back the rest even if one rollback stop() throws", async () => {
    const callOrder: string[] = [];
    const resources = [
      testResource("a", callOrder),
      testResource("b", callOrder, { failStop: true }),
      testResource("c", callOrder, { failStart: true }),
    ];

    const outcome = await startAll(resources);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected failure");
    // Both a and b still get a stop() attempt despite b's throwing.
    expect(callOrder).toEqual(["start:a", "start:b", "stop:b", "stop:a"]);
    expect(outcome.rollback.ok).toBe(false);
    expect(outcome.rollback.errors).toEqual([
      { resourceId: "b", error: "b failed to stop" },
    ]);
  });
});

describe("stopAll", () => {
  it("stops resources in exact reverse order", async () => {
    const callOrder: string[] = [];
    const resources = [
      testResource("a", callOrder),
      testResource("b", callOrder),
      testResource("c", callOrder),
    ];

    const outcome = await stopAll(resources);

    expect(outcome.ok).toBe(true);
    expect(callOrder).toEqual(["stop:c", "stop:b", "stop:a"]);
  });

  it("still attempts every resource even if a middle one's stop() throws", async () => {
    const callOrder: string[] = [];
    const resources = [
      testResource("a", callOrder),
      testResource("b", callOrder, { failStop: true }),
      testResource("c", callOrder),
    ];

    const outcome = await stopAll(resources);

    expect(callOrder).toEqual(["stop:c", "stop:b", "stop:a"]);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors).toEqual([
      { resourceId: "b", error: "b failed to stop" },
    ]);
  });
});
