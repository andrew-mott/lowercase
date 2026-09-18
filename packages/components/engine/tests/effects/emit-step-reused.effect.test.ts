import { describe, expect, it, vi } from "vitest";
import type { EventBusPort } from "@lcase/ports";
import { emitStepReusedFx } from "../../src/effects/emit-step-reused.effect.js";
import type { EffectHandlerDeps } from "../../src/engine.types.js";
import type { EmitStepReusedFx } from "../../src/types/effect.types.js";

describe("emitStepReusedFx", () => {
  it("emits step.reused via the emit() core, sourced from deps.source", async () => {
    const publish = vi.fn<EventBusPort["publish"]>(async () => {});
    const bus: EventBusPort = {
      publish,
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(async () => undefined),
    };
    const effect = {
      type: "EmitStepReused",
      scope: {
        flowid: "test-flowid",
        flowversionid: "test-flowversionid",
        runid: "test-runid",
        stepid: "test-stepid",
        steptype: "test-steptype",
      },
      data: {
        status: "success",
        sourceRunId: "test-source-runid",
      },
      traceId: "test-traceid",
    } satisfies EmitStepReusedFx;

    await emitStepReusedFx(effect, {
      bus,
      source: "lowercase://engine/test-engine",
    } as EffectHandlerDeps);

    expect(publish).toHaveBeenCalledOnce();
    const [type, event] = publish.mock.calls[0];
    expect(type).toBe("step.reused");
    expect(event).toMatchObject({
      type: "step.reused",
      source: "lowercase://engine/test-engine",
      traceid: "test-traceid",
      data: effect.data,
      ...effect.scope,
    });
  });
});
