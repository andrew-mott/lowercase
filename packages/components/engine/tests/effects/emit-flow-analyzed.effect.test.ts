import { describe, expect, it, vi } from "vitest";
import type { EmitterFactoryPort } from "@lcase/ports";
import type {
  EffectHandlerDeps,
  EmitFlowAnalyzedFx,
} from "../../src/engine.types.js";
import { emitFlowAnalyzedFx } from "../../src/effects/emit-flow-analyzed.effect.js";

describe("emitFlowSubmittedFx()", () => {
  it("creates an emitter and emits with the correct args", async () => {
    const emit = vi.fn().mockReturnValue({});
    const newFlowEmitterNewSpan = vi.fn().mockReturnValue({ emit });
    const ef = { newFlowEmitterNewSpan } as unknown as EmitterFactoryPort;
    const effect = {
      type: "EmitFlowAnalyzed",
      scope: {
        flowid: "test-flowid",
        flowversionid: "test-flowversionid",
        runid: "test-runid",
        source: "test-source",
      },
      data: {
        flow: {
          id: "test-flowid",
          name: "test-flowid",
          version: "test-flowversion",
        },
        run: {
          id: "test-runid",
        },
        analysis: {
          nodes: [],
          inEdges: {},
          outEdges: {},
          joinDeps: {},
          problems: [],
          refs: [],
        },
      },
      traceId: "test-traceid",
    } satisfies EmitFlowAnalyzedFx;

    await emitFlowAnalyzedFx(effect, { ef } as EffectHandlerDeps);

    expect(newFlowEmitterNewSpan).toHaveBeenCalledExactlyOnceWith(
      effect.scope,
      "test-traceid",
    );
    expect(emit).toHaveBeenCalledExactlyOnceWith("flow.analyzed", effect.data);
  });
});
