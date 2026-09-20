import { deriveSpanId } from "@lcase/events";
import type { AnyEvent } from "@lcase/types";
import { describe, expect, it, vi } from "vitest";
import { publishJobHttpSubmittedFx } from "../../src/effects/publish-job-http-submitted.effect.js";
import type {
  EffectHandlerDeps,
  PublishJobHttpSubmittedFx,
} from "../../src/engine.types.js";

const ENGINE_SOURCE = "lowercase://engine/internal-engine";

function makeEffect(): PublishJobHttpSubmittedFx {
  return {
    type: "PublishJobHttpSubmitted",
    scope: {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid: "job-1",
      capid: "http",
      toolid: "http",
    },
    data: { url: "https://example.test/resource", refs: [] },
    traceId: "0123456789abcdef0123456789abcdef",
  };
}

function makeDeps(publish = vi.fn().mockResolvedValue(undefined)) {
  const bus = { publish: vi.fn() };
  const deps = {
    bus,
    source: ENGINE_SOURCE,
    jobCommands: { publish },
  } as unknown as EffectHandlerDeps;
  return { deps, publish, bus };
}

describe("publishJobHttpSubmittedFx", () => {
  it("publishes exactly one canonical Message through the bound publisher", async () => {
    const { deps, publish } = makeDeps();
    const effect = makeEffect();

    await publishJobHttpSubmittedFx(effect, deps);

    expect(publish).toHaveBeenCalledTimes(1);
    const message = publish.mock.calls[0]![0] as AnyEvent<"job.http.submitted">;
    expect(message).toMatchObject({
      type: "job.http.submitted",
      ...effect.scope,
      source: ENGINE_SOURCE,
      traceid: effect.traceId,
      data: effect.data,
    });
  });

  // The engine no longer has a bus route for this type at all -- worker reads
  // it from a subscription. A bus publish here would be a second authority
  // over one occurrence.
  it("never publishes to the event bus", async () => {
    const { deps, bus } = makeDeps();

    await publishJobHttpSubmittedFx(makeEffect(), deps);

    expect(bus.publish).not.toHaveBeenCalled();
  });

  // The payoff of registering the job span policy: the submitted Message's
  // span is derived from run/step/job and parented on the step, where an
  // EmitterFactory emitter would have minted a random one with no parent.
  it("derives the job span and parents it on the step", async () => {
    const { deps, publish } = makeDeps();
    const effect = makeEffect();

    await publishJobHttpSubmittedFx(effect, deps);

    const message = publish.mock.calls[0]![0] as AnyEvent<"job.http.submitted">;
    expect(message.spanid).toBe(
      deriveSpanId("job", "run-1", "step-1", "job-1"),
    );
    expect(message.parentspanid).toBe(deriveSpanId("step", "run-1", "step-1"));
  });

  // Effects run fire-and-forget, so a rejection escaping here would be an
  // unhandled rejection rather than anything readable.
  it("reports a refused admission instead of rejecting", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("not admitted"));
    const { deps } = makeDeps(publish);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      publishJobHttpSubmittedFx(makeEffect(), deps),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]![0]).toContain("job-1");

    error.mockRestore();
  });
});
