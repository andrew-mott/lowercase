import { describe, expect, it, vi } from "vitest";
import type { MessageRouter } from "@lcase/message-router";
import { workerJobCommandSubscription } from "@lcase/message-topology/catalogs";
import type { Worker } from "@lcase/worker";
import { bindSubscriptions } from "../src/profile/bind-subscriptions.js";

// Distinct values on purpose: all three are plain numbers, so a config where
// two of them matched would let a test pass while the code read the wrong one.
const config = {
  maxConcurrentJobs: 4,
  protocolTimeoutMs: 60_000,
  maxConcurrencyPerKey: 2,
};

// Cast rather than a typed literal, unlike the router below: Worker is a class
// with private fields, so no object literal can satisfy it. Only the handler is
// read here.
const handler = async () => {};
const worker = { handleHttpJsonSubmitted: handler } as unknown as Worker;

function recordingRouter() {
  const bind = vi.fn();
  // Annotated, not cast. The compiler checks this double against the real
  // interface every build, so a fourth method on MessageRouter breaks this file
  // instead of leaving it silently testing a shape that no longer exists.
  const router: MessageRouter = {
    publisher: () => {
      throw new Error("bindSubscriptions must not resolve a publisher");
    },
    bind,
    // Refused outright rather than asserted afterwards. Sealing belongs to the
    // composition root, which binds nothing else only because this is the whole
    // list -- a helper that sealed would decide that for it.
    seal: () => {
      throw new Error("bindSubscriptions must not seal; the profile owns that");
    },
  };
  return { router, bind };
}

describe("bindSubscriptions", () => {
  it("binds the Worker command subscription and nothing else", () => {
    const { router, bind } = recordingRouter();

    bindSubscriptions(router, worker, config);

    expect(bind).toHaveBeenCalledTimes(1);
    expect(bind.mock.calls[0]?.[0].subscription).toBe(
      workerJobCommandSubscription,
    );
  });

  // The mailbox bound, which is not the same thing as Worker's own capacity
  // bound -- this one limits what the lane presents at once, Worker's limits
  // the component however work reaches it. Reading the wrong field would
  // typecheck and run, just with the wrong number.
  it("takes maxInFlight from maxConcurrentJobs", () => {
    const { router, bind } = recordingRouter();

    bindSubscriptions(router, worker, config);

    expect(bind.mock.calls[0]?.[0].maxInFlight).toBe(config.maxConcurrentJobs);
  });
});
