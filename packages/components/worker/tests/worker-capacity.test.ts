import { describe, expect, it, vi } from "vitest";
import type { ProtocolResult } from "../src/protocol/protocol-executor.types.js";
import { makeSubmission } from "./helpers/fixtures.js";
import { makeWorker } from "./helpers/worker-fakes.js";

// Capacity is now owned by Worker rather than wrapped around it, so it is
// exercised through Worker's own entry point. The protocol executor is the
// gate: each job parks there until the test settles it, which is what holds a
// capacity slot open.
function makeGatedWorker(maxConcurrentJobs: number) {
  const settlers: Array<(result: ProtocolResult) => void> = [];
  const fakes = makeWorker({
    maxConcurrentJobs,
    protocolResult: () =>
      new Promise<ProtocolResult>((resolve) => settlers.push(resolve)),
  });
  const settleNext = () => {
    const settle = settlers.shift();
    if (!settle) throw new Error("no parked protocol call to settle");
    settle({ ok: true, payload: null });
  };
  return { ...fakes, settlers, settleNext };
}

describe("Worker capacity", () => {
  it("blocks a second job until the first completes and releases capacity", async () => {
    const { worker, settlers, settleNext, protocolExecute } =
      makeGatedWorker(1);

    const firstPromise = worker.executeSubmission(
      makeSubmission({ scope: { jobid: "job-1" } }),
    );
    await vi.waitFor(() => expect(settlers).toHaveLength(1));

    let secondSettled = false;
    const secondPromise = worker
      .executeSubmission(makeSubmission({ scope: { jobid: "job-2" } }))
      .then((result) => {
        secondSettled = true;
        return result;
      });

    // Give the event loop a chance -- the second job must still be queued.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(secondSettled).toBe(false);
    expect(protocolExecute).toHaveBeenCalledTimes(1);

    settleNext();
    await firstPromise;
    await vi.waitFor(() => expect(settlers).toHaveLength(1));
    settleNext();
    const second = await secondPromise;

    expect(secondSettled).toBe(true);
    expect(second.status).toBe("completed");
    expect(protocolExecute).toHaveBeenCalledTimes(2);
  });

  it("runs jobs concurrently up to the configured bound", async () => {
    const { worker, settlers, protocolExecute } = makeGatedWorker(2);

    void worker.executeSubmission(
      makeSubmission({ scope: { jobid: "job-1" } }),
    );
    void worker.executeSubmission(
      makeSubmission({ scope: { jobid: "job-2" } }),
    );
    void worker.executeSubmission(
      makeSubmission({ scope: { jobid: "job-3" } }),
    );

    await vi.waitFor(() => expect(settlers).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(protocolExecute).toHaveBeenCalledTimes(2);

    settlers.forEach((settle) => settle({ ok: true, payload: null }));
  });

  it("aborting while queued for capacity resolves CANCELLED and records no lifecycle facts for that job", async () => {
    const { worker, settlers, settleNext, protocolExecute, events } =
      makeGatedWorker(1);

    const firstPromise = worker.executeSubmission(
      makeSubmission({ scope: { jobid: "job-1" } }),
    );
    await vi.waitFor(() => expect(settlers).toHaveLength(1));

    const controller = new AbortController();
    const secondPromise = worker.executeSubmission(
      makeSubmission({ scope: { jobid: "job-2" } }),
      controller.signal,
    );
    controller.abort();
    const second = await secondPromise;

    expect(second).toMatchObject({
      status: "failed",
      error: { code: "CANCELLED" },
    });
    // Only the first job ever ran, and only the first job was ever "started".
    expect(protocolExecute).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.kind)).toEqual(["job-execution-started"]);

    settleNext();
    await firstPromise;
  });

  it("a signal already aborted at entry never consumes capacity or reaches the runner", async () => {
    const { worker, protocolExecute, events } = makeWorker({
      maxConcurrentJobs: 1,
    });
    const controller = new AbortController();
    controller.abort();

    const result = await worker.executeSubmission(
      makeSubmission({ scope: { jobid: "job-1" } }),
      controller.signal,
    );

    expect(result).toMatchObject({
      status: "failed",
      error: { code: "CANCELLED" },
    });
    expect(protocolExecute).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);

    // Capacity was never taken, so an ordinary job still runs.
    await expect(
      worker.executeSubmission(makeSubmission({ scope: { jobid: "job-2" } })),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("releases capacity even when execution throws", async () => {
    const thrown = new Error("boom");
    const { worker, protocolExecute } = makeWorker({
      maxConcurrentJobs: 1,
      protocolResult: () => {
        throw thrown;
      },
    });

    await expect(
      worker.executeSubmission(makeSubmission({ scope: { jobid: "job-1" } })),
    ).rejects.toBe(thrown);

    // A second job must reach the runner rather than hang forever queued
    // behind the first.
    await expect(
      worker.executeSubmission(makeSubmission({ scope: { jobid: "job-2" } })),
    ).rejects.toBe(thrown);
    expect(protocolExecute).toHaveBeenCalledTimes(2);
  });
});
