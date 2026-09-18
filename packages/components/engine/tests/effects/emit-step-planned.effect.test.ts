import { describe, expect, it, vi } from "vitest";
import type { EventBusPort } from "@lcase/ports";
import { emitStepPlannedFx } from "../../src/effects/emit-step-planned.effect.js";
import type {
  EffectHandlerDeps,
  EmitStepPlannedFx,
} from "../../src/engine.types.js";

describe("emitStepPlannedFx", () => {
  it("emits step.planned via the emit() core, sourced from deps.source", async () => {
    const publish = vi.fn<EventBusPort["publish"]>(async () => {});
    const bus: EventBusPort = {
      publish,
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(async () => undefined),
    };
    const effect = {
      type: "EmitStepPlanned",
      scope: {
        flowid: "test-flowid",
        flowversionid: "test-flowversionid",
        runid: "test-runid",
        stepid: "test-stepid",
        steptype: "test-steptype",
      },
      data: {
        step: {
          id: "test-step.id",
          name: "test-step.name",
          type: "test-step.type",
        },
      },
      traceId: "test-traceid",
    } satisfies EmitStepPlannedFx;

    await emitStepPlannedFx(effect, {
      bus,
      source: "lowercase://engine/test-engine",
    } as EffectHandlerDeps);

    expect(publish).toHaveBeenCalledOnce();
    const [type, event] = publish.mock.calls[0];
    expect(type).toBe("step.planned");
    expect(event).toMatchObject({
      type: "step.planned",
      source: "lowercase://engine/test-engine",
      traceid: "test-traceid",
      data: effect.data,
      ...effect.scope,
    });
  });
});
