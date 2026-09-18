import { describe, expect, it } from "vitest";
import { combineForProtocolRun } from "../src/protocol/combine-for-protocol-run.js";

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

describe("combineForProtocolRun", () => {
  it("no caller signal: the combined signal is just the timeout, cause is timeout once it fires", async () => {
    const combined = combineForProtocolRun(undefined, 10);
    await waitForAbort(combined.signal);
    expect(combined.cause()).toBe("timeout");
    combined.dispose();
  });

  it("caller aborts before any timeout: cause is caller", async () => {
    const controller = new AbortController();
    const combined = combineForProtocolRun(controller.signal, 5_000);
    controller.abort();
    await waitForAbort(combined.signal);
    expect(combined.cause()).toBe("caller");
    combined.dispose();
  });

  it("already-aborted caller signal at construction time: cause is caller immediately", () => {
    const controller = new AbortController();
    controller.abort();
    const combined = combineForProtocolRun(controller.signal, 5_000);
    expect(combined.cause()).toBe("caller");
    combined.dispose();
  });

  it("the exact race: timeout fires first, caller aborts shortly after (before cause() is ever read) -- still reads timeout", async () => {
    const controller = new AbortController();
    const combined = combineForProtocolRun(controller.signal, 10);

    // Deliberately abort the caller *after* the timeout has already fired,
    // simulating a caller cancelling right as a timeout was independently in
    // flight. The naive "check both signals' current state, caller wins"
    // approach would misclassify this as "caller" -- this proves it doesn't.
    await waitForAbort(combined.signal);
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(combined.cause()).toBe("timeout");
    combined.dispose();
  });

  it("dispose() stops further changes to an already-recorded cause", async () => {
    const controller = new AbortController();
    const combined = combineForProtocolRun(controller.signal, 5_000);
    controller.abort();
    await waitForAbort(combined.signal);
    expect(combined.cause()).toBe("caller");

    combined.dispose();
    // No further source event should be able to change the recorded cause
    // after dispose (there is nothing left listening).
    expect(combined.cause()).toBe("caller");
  });
});
