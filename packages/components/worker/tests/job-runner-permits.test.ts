import { describe, expect, it } from "vitest";
import { makeContext, makeWork } from "./helpers/fixtures.js";
import { createFakePermitPort } from "./helpers/fake-resource-permit.js";
import { makeJobRunner } from "./helpers/worker-fakes.js";

describe("JobRunner resource permits", () => {
  it("does not release or invoke the protocol when permit acquisition fails", async () => {
    const permits = createFakePermitPort();
    const thrown = new Error("permit unavailable");
    permits.acquire.mockRejectedValueOnce(thrown);
    const { runner, release, protocolExecute } = makeJobRunner({ permits });

    await expect(runner.run(makeWork(), makeContext())).rejects.toBe(thrown);

    expect(release).not.toHaveBeenCalled();
    expect(protocolExecute).not.toHaveBeenCalled();
  });

  it("releases on success", async () => {
    const { runner, release } = makeJobRunner();

    await runner.run(makeWork(), makeContext());

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("grant-1");
  });

  it("releases on an expected (resolved) protocol failure", async () => {
    const { runner, release } = makeJobRunner({
      protocolResult: () => ({
        ok: false,
        error: { code: "HTTP_STATUS_FAILED", message: "x", retryable: false },
      }),
    });

    await runner.run(makeWork(), makeContext());

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("grant-1");
  });

  it("releases even when the protocol executor throws, and re-throws", async () => {
    const thrown = new Error("boom");
    const { runner, release } = makeJobRunner({
      protocolResult: () => {
        throw thrown;
      },
    });

    await expect(runner.run(makeWork(), makeContext())).rejects.toThrow(thrown);

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("grant-1");
  });
});
