import { describe, expect, it, vi } from "vitest";
import { managedResource } from "../src/managed-resource.js";

describe("managedResource", () => {
  it("defaults start/stop to no-ops and health to healthy when no hooks are given", async () => {
    const resource = managedResource("r1", { some: "instance" });

    await expect(resource.start()).resolves.toBeUndefined();
    await expect(resource.stop()).resolves.toBeUndefined();
    await expect(resource.health()).resolves.toEqual({ status: "healthy" });
    expect(resource.instance).toEqual({ some: "instance" });
  });

  it("awaits a synchronous start/stop hook (mirrors ObservabilityTap)", async () => {
    const start = vi.fn(() => undefined);
    const stop = vi.fn(() => undefined);
    const resource = managedResource("tap", "instance", { start, stop });

    await resource.start();
    await resource.stop();

    expect(start).toHaveBeenCalledWith("instance");
    expect(stop).toHaveBeenCalledWith("instance");
  });

  it("awaits an asynchronous start/stop hook (mirrors Engine/sinks)", async () => {
    const start = vi.fn(async () => {
      await Promise.resolve();
    });
    const stop = vi.fn(async () => {
      await Promise.resolve();
    });
    const resource = managedResource("engine", "instance", { start, stop });

    await resource.start();
    await resource.stop();

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("treats a missing start hook as a no-op while stop still fires (mirrors InMemoryEventBus)", async () => {
    const stop = vi.fn();
    const resource = managedResource("bus", "instance", { stop });

    await expect(resource.start()).resolves.toBeUndefined();
    await resource.stop();

    expect(stop).toHaveBeenCalledWith("instance");
  });

  it("surfaces a custom health hook's result verbatim", async () => {
    const health = vi.fn(() => ({
      status: "unhealthy" as const,
      reason: "disconnected",
    }));
    const resource = managedResource("db", "instance", { health });

    await expect(resource.health()).resolves.toEqual({
      status: "unhealthy",
      reason: "disconnected",
    });
  });
});
