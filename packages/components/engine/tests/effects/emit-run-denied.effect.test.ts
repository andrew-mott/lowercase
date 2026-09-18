import { describe, expect, it, vi } from "vitest";
import type { EmitterFactoryPort } from "@lcase/ports";
import { emitRunDeniedFx } from "../../src/effects/emit-run-denied.effect.js";
import type { EffectHandlerDeps } from "../../src/engine.types.js";
import type { EmitRunDeniedFx } from "../../src/types/effect.types.js";

describe("emitRunDeniedFx()", () => {
  it("creates an emitter and emits with the correct args", async () => {
    const emit = vi.fn().mockReturnValue({});
    const newRunEmitterNewSpan = vi.fn().mockReturnValue({ emit });
    const ef = { newRunEmitterNewSpan } as unknown as EmitterFactoryPort;
    const effect: EmitRunDeniedFx = {
      type: "EmitRunDenied",
      data: {
        error: "Run id already exists in engine.",
      },
      scope: {
        flowid: "test-flowid",
        flowversionid: "test-flowversionid",
        runid: "test-runid",
        source: "lowercase://engine",
      },
      traceId: "test-traceid",
    };

    await emitRunDeniedFx(effect, { ef } as EffectHandlerDeps);

    expect(newRunEmitterNewSpan).toHaveBeenCalledExactlyOnceWith({
      ...effect.scope,
      traceid: "test-traceid",
    });
    expect(emit).toHaveBeenCalledExactlyOnceWith("run.denied", effect.data);
  });
});
