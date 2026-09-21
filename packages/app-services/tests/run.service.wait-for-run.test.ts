import { describe, expect, it, vi } from "vitest";
import type { RunQueryPort, RunSettledWaiterPort } from "@lcase/ports";
import type { RunOutputs } from "@lcase/types";
import { RunService } from "../src/run.service.js";
import { makeEmitterFactory } from "./helpers/make-run-service.js";

const outputs: RunOutputs = {
  speech: { ok: true, hash: "a".repeat(64), contentType: "audio/wav" },
};

const detail = (status: string) => ({
  ok: true as const,
  value: { run: { status }, steps: [] },
});

// A waiter the test settles by hand, recording when it was registered and
// cancelled.
function makeWaiter() {
  const log: string[] = [];
  let settle = () => {};
  const runSettled: RunSettledWaiterPort = {
    whenSettled: () => {
      log.push("registered");
      return {
        promise: new Promise<void>((resolve) => {
          settle = resolve;
        }),
        cancel: () => log.push("cancelled"),
      };
    },
  };
  return { runSettled, log, settle: () => settle() };
}

function makeService(
  getRunDetail: ReturnType<typeof vi.fn>,
  runSettled: RunSettledWaiterPort,
) {
  const service = new RunService({
    artifactRepository: {} as never,
    artifacts: {} as never,
    ef: makeEmitterFactory(),
    runRepository: {} as never,
    runQuery: { getRunDetail } as unknown as RunQueryPort,
    runSettled,
  });
  const getRunOutputs = vi
    .spyOn(service, "getRunOutputs")
    .mockResolvedValue({ ok: true, value: outputs });
  return { service, getRunOutputs };
}

describe("RunService.waitForRun", () => {
  it("returns the outputs of a run that already finished", async () => {
    const { runSettled, log } = makeWaiter();
    const getRunDetail = vi.fn().mockResolvedValue(detail("completed"));
    const { service } = makeService(getRunDetail, runSettled);

    const result = await service.waitForRun("run-1", { timeoutMs: 1000 });

    expect(result).toEqual({ status: "completed", outputs });
    expect(log).toEqual(["registered", "cancelled"]);
  });

  it("waits for a run that is still going, then returns its outputs", async () => {
    const { runSettled, settle } = makeWaiter();
    const getRunDetail = vi
      .fn()
      .mockResolvedValueOnce(detail("started"))
      .mockResolvedValue(detail("completed"));
    const { service } = makeService(getRunDetail, runSettled);

    const pending = service.waitForRun("run-1", { timeoutMs: 1000 });
    await vi.waitFor(() => expect(getRunDetail).toHaveBeenCalledTimes(1));
    settle();

    expect(await pending).toEqual({ status: "completed", outputs });
    expect(getRunDetail).toHaveBeenCalledTimes(2);
  });

  it("registers before reading the status, so a settle during the read is not missed", async () => {
    const { runSettled, log, settle } = makeWaiter();
    const getRunDetail = vi
      .fn()
      .mockImplementationOnce(async () => {
        log.push("read");
        // The run settles after the read began but before it returned.
        settle();
        return detail("started");
      })
      .mockResolvedValue(detail("completed"));
    const { service } = makeService(getRunDetail, runSettled);

    const result = await service.waitForRun("run-1", { timeoutMs: 1000 });

    expect(result).toEqual({ status: "completed", outputs });
    expect(log.slice(0, 2)).toEqual(["registered", "read"]);
  });

  it("reports a failed run without reading outputs", async () => {
    const { runSettled } = makeWaiter();
    const getRunDetail = vi.fn().mockResolvedValue(detail("failed"));
    const { service, getRunOutputs } = makeService(getRunDetail, runSettled);

    const result = await service.waitForRun("run-1", { timeoutMs: 1000 });

    expect(result).toEqual({ status: "failed", error: "Run failed" });
    expect(getRunOutputs).not.toHaveBeenCalled();
  });

  it("reports a finished run whose outputs cannot be read as failed", async () => {
    const { runSettled } = makeWaiter();
    const getRunDetail = vi.fn().mockResolvedValue(detail("completed"));
    const { service, getRunOutputs } = makeService(getRunDetail, runSettled);
    getRunOutputs.mockResolvedValue({ ok: false, error: "Unable to load" });

    const result = await service.waitForRun("run-1", { timeoutMs: 1000 });

    expect(result).toEqual({ status: "failed", error: "Unable to load" });
  });

  it("times out when the run does not settle, and stops waiting", async () => {
    const { runSettled, log } = makeWaiter();
    const getRunDetail = vi.fn().mockResolvedValue(detail("started"));
    const { service } = makeService(getRunDetail, runSettled);

    const result = await service.waitForRun("run-1", { timeoutMs: 10 });

    expect(result).toEqual({ status: "timeout" });
    expect(log).toEqual(["registered", "cancelled"]);
  });

  it("reports a failed status read as failed", async () => {
    const { runSettled } = makeWaiter();
    const getRunDetail = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Run not found: run-1" });
    const { service } = makeService(getRunDetail, runSettled);

    const result = await service.waitForRun("run-1", { timeoutMs: 1000 });

    expect(result).toEqual({ status: "failed", error: "Run not found: run-1" });
  });
});
