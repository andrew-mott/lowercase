import { describe, expect, it, vi } from "vitest";
import type { EventBusPort } from "@lcase/ports";
import { emitStepStartedFx } from "../../src/effects/emit-step-started.effect.js";
import type {
  EffectHandlerDeps,
  EmitStepStartedFx,
} from "../../src/engine.types.js";

describe("emitStepStartedFx", () => {
  it("emits step.started via the emit() core, sourced from deps.source", async () => {
    const publish = vi.fn<EventBusPort["publish"]>(async () => {});
    const bus: EventBusPort = {
      publish,
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(async () => undefined),
    };
    const effect = {
      type: "EmitStepStarted",
      scope: {
        flowid: "test-flowid",
        flowversionid: "test-flowversionid",
        runid: "test-runid",
        stepid: "test-stepid",
        steptype: "test-steptype",
      },
      data: {
        status: "started",
        step: {
          id: "test-step.id",
          name: "test-step.name",
          type: "test-step.type",
        },
      },
      traceId: "test-traceid",
    } satisfies EmitStepStartedFx;

    await emitStepStartedFx(effect, {
      bus,
      source: "lowercase://engine/test-engine",
    } as EffectHandlerDeps);

    expect(publish).toHaveBeenCalledOnce();
    const [type, event] = publish.mock.calls[0];
    expect(type).toBe("step.started");
    expect(event).toMatchObject({
      type: "step.started",
      source: "lowercase://engine/test-engine",
      traceid: "test-traceid",
      data: effect.data,
      ...effect.scope,
    });
  });
});
