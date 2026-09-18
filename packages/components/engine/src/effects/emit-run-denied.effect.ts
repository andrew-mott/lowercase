import type { EffectHandler, EffectHandlerDeps } from "../engine.types.js";
import type { EmitRunDeniedFx } from "../types/effect.types.js";

export const emitRunDeniedFx: EffectHandler<"EmitRunDenied"> = async (
  effect: EmitRunDeniedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newRunEmitterNewSpan({
    ...effect.scope,
    traceid: effect.traceId,
  });

  await emitter.emit("run.denied", effect.data);
};
