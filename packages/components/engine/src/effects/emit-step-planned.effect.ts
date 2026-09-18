import { emit } from "@lcase/events";
import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitStepPlannedFx,
} from "../engine.types.js";

/**
 * Emits a `step.planned` event, used to a stepPlanned
 * reducer + planner + effect combo.
 * @param effect EmitStepPlannedFx
 * @param deps EffectHandlerDeps
 */
export const emitStepPlannedFx: EffectHandler<"EmitStepPlanned"> = async (
  effect: EmitStepPlannedFx,
  deps: EffectHandlerDeps,
) => {
  await emit(deps.bus, "step.planned", effect.data, {
    ...effect.scope,
    source: deps.source,
    traceId: effect.traceId,
  });
};
