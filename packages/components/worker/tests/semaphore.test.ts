import { describe, expect, it } from "vitest";
import { createSemaphore } from "../src/concurrency/semaphore.js";

describe("createSemaphore", () => {
  it("grants immediately while slots are available, tracking `available`", async () => {
    const sem = createSemaphore(2);
    expect(sem.available).toBe(2);

    const a = await sem.acquire();
    expect(a.kind).toBe("acquired");
    expect(sem.available).toBe(1);

    const b = await sem.acquire();
    expect(b.kind).toBe("acquired");
    expect(sem.available).toBe(0);
  });

  it("hands a freed slot straight to the next FIFO waiter instead of just incrementing available", async () => {
    const sem = createSemaphore(1);
    const first = await sem.acquire();
    if (first.kind !== "acquired") throw new Error("expected acquired");

    const order: string[] = [];
    const secondPromise = sem.acquire().then((outcome) => {
      order.push("second");
      return outcome;
    });
    const thirdPromise = sem.acquire().then((outcome) => {
      order.push("third");
      return outcome;
    });

    // Neither has run yet -- both are queued behind the held slot.
    expect(sem.available).toBe(0);

    first.release();
    const second = await secondPromise;
    expect(second.kind).toBe("acquired");
    expect(order).toEqual(["second"]);
    expect(sem.available).toBe(0); // handed straight to "second", not incremented

    if (second.kind !== "acquired") throw new Error("expected acquired");
    second.release();
    const third = await thirdPromise;
    expect(third.kind).toBe("acquired");
    expect(order).toEqual(["second", "third"]);
  });

  it("cancelling a queued wait removes it from the queue and never later double-grants it", async () => {
    const sem = createSemaphore(1);
    const first = await sem.acquire();
    if (first.kind !== "acquired") throw new Error("expected acquired");

    const controller = new AbortController();
    const queuedPromise = sem.acquire(controller.signal);
    controller.abort();
    const queued = await queuedPromise;
    expect(queued.kind).toBe("cancelled");

    // Releasing now must not resolve the already-cancelled waiter again --
    // there's nothing left in the queue, so it should just free the slot.
    first.release();
    expect(sem.available).toBe(1);
  });

  it("an already-aborted signal resolves cancelled immediately without consuming a slot", async () => {
    const sem = createSemaphore(1);
    const controller = new AbortController();
    controller.abort();

    const outcome = await sem.acquire(controller.signal);

    expect(outcome.kind).toBe("cancelled");
    expect(sem.available).toBe(1);
  });

  it("throws on a non-positive or non-integer max", () => {
    expect(() => createSemaphore(0)).toThrow();
    expect(() => createSemaphore(-1)).toThrow();
    expect(() => createSemaphore(1.5)).toThrow();
  });
});
