import { describe, expect, it, vi } from "vitest";
import { buildEvent } from "@lcase/events";
import type { AnyEvent } from "@lcase/types";
import {
  DeliveryLane,
  type DeliveredMessage,
  type DeliveryFailure,
  type DeliveryLaneDeps,
} from "../src/delivery-lane.js";

function completedEvent(output: string): AnyEvent<"job.httpjson.completed"> {
  return buildEvent(
    "job.httpjson.completed",
    { status: "success", output },
    {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid: `job-${output}`,
      capid: "httpjson",
      toolid: "tool-1",
      source: "lowercase://worker/test",
    },
  );
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeLane(overrides: Partial<DeliveryLaneDeps> = {}): {
  lane: DeliveryLane;
  deps: DeliveryLaneDeps;
} {
  const deps: DeliveryLaneDeps = {
    subscriptionId: "test.subscription.v1",
    invoke: async () => {},
    maxInFlight: 1,
    reportFailure: () => {},
    onSettled: () => {},
    ...overrides,
  };
  return { lane: new DeliveryLane(deps), deps };
}

describe("DeliveryLane", () => {
  it("never invokes its handler inside the enqueue call stack", () => {
    const invoke = vi.fn(async () => {});
    const { lane } = makeLane({ invoke });

    void lane.enqueue({ message: completedEvent("a") });

    expect(invoke).not.toHaveBeenCalled();
  });

  it("processes FIFO with exactly one active handler at maxInFlight 1", async () => {
    const started: string[] = [];
    const gate = deferred();
    const invoke = vi.fn(async (message: DeliveredMessage) => {
      started.push(message.id);
      await gate.promise;
    });
    const { lane } = makeLane({ invoke, maxInFlight: 1 });

    const first = completedEvent("a");
    const second = completedEvent("b");
    const third = completedEvent("c");
    void lane.enqueue({ message: first });
    void lane.enqueue({ message: second });
    void lane.enqueue({ message: third });

    await vi.waitFor(() => expect(started).toHaveLength(1));
    expect(started).toEqual([first.id]);

    gate.resolve();
    await vi.waitFor(() => expect(started).toHaveLength(3));
    expect(started).toEqual([first.id, second.id, third.id]);
  });

  it("runs up to maxInFlight handlers concurrently and no more", async () => {
    let active = 0;
    let peak = 0;
    const gate = deferred();
    const invoke = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
    });
    const { lane } = makeLane({ invoke, maxInFlight: 3 });

    for (const id of ["a", "b", "c", "d", "e"]) {
      void lane.enqueue({ message: completedEvent(id) });
    }

    await vi.waitFor(() => expect(active).toBe(3));
    expect(peak).toBe(3);

    gate.resolve();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(5));
    expect(peak).toBe(3);
  });

  it("reports a failed delivery with identity only, then continues", async () => {
    const failures: DeliveryFailure[] = [];
    const failing = completedEvent("a");
    const invoke = vi.fn(async (message: DeliveredMessage) => {
      if (message.id === failing.id) throw new Error("handler exploded");
    });
    const { lane } = makeLane({
      invoke,
      reportFailure: (failure) => failures.push(failure),
    });

    void lane.enqueue({ message: failing });
    const next = completedEvent("b");
    void lane.enqueue({ message: next });

    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      subscriptionId: "test.subscription.v1",
      messageId: failing.id,
      messageType: "job.httpjson.completed",
      source: "lowercase://worker/test",
    });
    // Identity only -- a Message body can carry caller-supplied input.
    expect(failures[0]).not.toHaveProperty("data");
    expect(invoke).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: next.id }),
    );
  });

  it("does not retry a failed delivery", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("always fails");
    });
    const { lane } = makeLane({ invoke });

    void lane.enqueue({ message: completedEvent("a") });

    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps processing when the failure reporter itself throws", async () => {
    const failing = completedEvent("a");
    const invoke = vi.fn(async (message: DeliveredMessage) => {
      if (message.id === failing.id) throw new Error("handler exploded");
    });
    const { lane } = makeLane({
      invoke,
      reportFailure: () => {
        throw new Error("reporter exploded");
      },
    });

    void lane.enqueue({ message: failing });
    void lane.enqueue({ message: completedEvent("b") });

    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  });

  it("settles the router bookkeeping for both success and failure", async () => {
    const onSettled = vi.fn();
    const failing = completedEvent("a");
    const invoke = vi.fn(async (message: DeliveredMessage) => {
      if (message.id === failing.id) throw new Error("handler exploded");
    });
    const { lane } = makeLane({ invoke, onSettled });

    void lane.enqueue({ message: failing });
    void lane.enqueue({ message: completedEvent("b") });

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledTimes(2));
  });

  // The retire hook is what a log-backed carrier settles its source with. The
  // ordering below is the contract: a carrier that acknowledged before its
  // handler finished would be claiming work it had not done.
  it("retires a delivery after its handler settles, and holds the slot until it does", async () => {
    const order: string[] = [];
    const retiring = deferred();
    const invoke = vi.fn(async () => {
      order.push("handled");
    });
    const { lane } = makeLane({ invoke, maxInFlight: 1 });

    void lane.enqueue({
      message: completedEvent("a"),
      retire: async () => {
        order.push("retire-started");
        await retiring.promise;
        order.push("retire-finished");
      },
    });
    void lane.enqueue({ message: completedEvent("b") });

    await vi.waitFor(() =>
      expect(order).toEqual(["handled", "retire-started"]),
    );
    // The second delivery cannot start while the first is still retiring.
    expect(invoke).toHaveBeenCalledTimes(1);

    retiring.resolve();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(order).toEqual([
      "handled",
      "retire-started",
      "retire-finished",
      "handled",
    ]);
  });

  it("retires a delivery whose handler failed, and reports a retire that itself fails", async () => {
    const reportFailure = vi.fn();
    const retire = vi.fn(async () => {
      throw new Error("ack exploded");
    });
    const invoke = vi.fn(async () => {
      throw new Error("handler exploded");
    });
    const { lane } = makeLane({ invoke, reportFailure });

    void lane.enqueue({ message: completedEvent("a"), retire });

    await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledTimes(2));
    expect(retire).toHaveBeenCalledTimes(1);
    expect(
      reportFailure.mock.calls.map(([failure]) => String(failure.error)),
    ).toEqual(["Error: handler exploded", "Error: ack exploded"]);
  });

  it("resolves enqueue on settlement and never rejects, so a carrier can use it for backpressure", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("handler exploded");
    });
    const { lane } = makeLane({ invoke, reportFailure: () => {} });

    // A failing handler and a failing retire both still resolve: the promise
    // reports that the lane is done with this delivery, not that it succeeded.
    await expect(
      lane.enqueue({
        message: completedEvent("a"),
        retire: async () => {
          throw new Error("ack exploded");
        },
      }),
    ).resolves.toBeUndefined();
  });
});
