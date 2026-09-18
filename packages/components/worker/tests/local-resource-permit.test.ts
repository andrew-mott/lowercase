import { describe, expect, it, vi } from "vitest";
import { createLocalResourcePermit } from "../src/adapters/outbound/local-resource-permit.adapter.js";

describe("createLocalResourcePermit", () => {
  it("serializes acquisitions for the same resourceKey up to maxConcurrencyPerKey", async () => {
    const port = createLocalResourcePermit({ maxConcurrencyPerKey: 1 });

    const grant1 = await port.acquire({ requestId: "r1", resourceKey: "k" });
    let secondSettled = false;
    const secondPromise = port
      .acquire({ requestId: "r2", resourceKey: "k" })
      .then((g) => {
        secondSettled = true;
        return g;
      });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(secondSettled).toBe(false);

    await port.release(grant1.grantId);
    const grant2 = await secondPromise;
    expect(secondSettled).toBe(true);
    expect(grant2.resourceKey).toBe("k");
  });

  it("different resourceKeys don't block each other", async () => {
    const port = createLocalResourcePermit({ maxConcurrencyPerKey: 1 });

    const grantA = await port.acquire({ requestId: "a", resourceKey: "key-a" });
    const grantB = await port.acquire({ requestId: "b", resourceKey: "key-b" });

    expect(grantA.resourceKey).toBe("key-a");
    expect(grantB.resourceKey).toBe("key-b");
  });

  it("release() is idempotent for an unknown or already-released grantId", async () => {
    const port = createLocalResourcePermit({ maxConcurrencyPerKey: 1 });
    const grant = await port.acquire({ requestId: "r1", resourceKey: "k" });

    await expect(port.release(grant.grantId)).resolves.toBeUndefined();
    await expect(port.release(grant.grantId)).resolves.toBeUndefined(); // second release: no-op
    await expect(port.release("never-issued")).resolves.toBeUndefined();
  });

  it("cancellation while waiting rejects rather than resolving, so signal-based classification upstream keeps working", async () => {
    const port = createLocalResourcePermit({ maxConcurrencyPerKey: 1 });
    await port.acquire({ requestId: "r1", resourceKey: "k" }); // hold the only slot

    const controller = new AbortController();
    const waitingPromise = port.acquire(
      { requestId: "r2", resourceKey: "k" },
      { signal: controller.signal },
    );
    controller.abort();

    await expect(waitingPromise).rejects.toThrow();
  });

  it("reports telemetry hooks without those hooks being required for correctness", async () => {
    const onWaitStart = vi.fn();
    const onGranted = vi.fn();
    const onReleased = vi.fn();
    const port = createLocalResourcePermit(
      { maxConcurrencyPerKey: 1 },
      { onWaitStart, onGranted, onReleased },
    );

    const grant = await port.acquire({ requestId: "r1", resourceKey: "k" });
    await port.release(grant.grantId);

    expect(onWaitStart).toHaveBeenCalledTimes(1);
    expect(onGranted).toHaveBeenCalledTimes(1);
    expect(onReleased).toHaveBeenCalledWith(grant.grantId);
  });
});
