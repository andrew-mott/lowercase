import { emit } from "@lcase/events";
import type { EffectHandler, EffectHandlerDeps } from "../engine.types.js";
import type { EmitStepReusedFx } from "../types/effect.types.js";

/**
 * Emits a `step.reused` event
 * @param effect EmitStepPlannedFx
 * @param deps EffectHandlerDeps
 */
export const emitStepReusedFx: EffectHandler<"EmitStepReused"> = async (
  effect: EmitStepReusedFx,
  deps: EffectHandlerDeps,
) => {
  await emit(deps.bus, "step.reused", effect.data, {
    ...effect.scope,
    source: deps.source,
    traceId: effect.traceId,
  });
};
