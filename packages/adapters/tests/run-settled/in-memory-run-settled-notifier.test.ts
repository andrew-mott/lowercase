import { describe, expect, it } from "vitest";
import { InMemoryRunSettledNotifier } from "../../src/run-settled/index.js";

async function resolved(promise: Promise<void>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10)),
  ]);
}

describe("InMemoryRunSettledNotifier", () => {
  it("resolves a waiter registered before the run settles", async () => {
    const notifier = new InMemoryRunSettledNotifier();
    const wait = notifier.whenSettled("run-1");

    notifier.settled("run-1");

    expect(await resolved(wait.promise)).toBe(true);
  });

  it("does not remember a run that settled before the wait", async () => {
    const notifier = new InMemoryRunSettledNotifier();

    notifier.settled("run-1");
    const wait = notifier.whenSettled("run-1");

    expect(await resolved(wait.promise)).toBe(false);
  });

  it("resolves every waiter for the run and no other run's", async () => {
    const notifier = new InMemoryRunSettledNotifier();
    const first = notifier.whenSettled("run-1");
    const second = notifier.whenSettled("run-1");
    const other = notifier.whenSettled("run-2");

    notifier.settled("run-1");

    expect(await resolved(first.promise)).toBe(true);
    expect(await resolved(second.promise)).toBe(true);
    expect(await resolved(other.promise)).toBe(false);
  });

  it("stops a cancelled waiter from resolving", async () => {
    const notifier = new InMemoryRunSettledNotifier();
    const wait = notifier.whenSettled("run-1");

    wait.cancel();
    notifier.settled("run-1");

    expect(await resolved(wait.promise)).toBe(false);
  });
});
