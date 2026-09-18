import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitStepFailedFx,
} from "../engine.types.js";

/**
 * Emits a `step.planned` event, used to a stepPlanned
 * reducer + planner + effect combo.
 * @param effect EmitStepPlannedFx
 * @param deps EffectHandlerDeps
 */
export const emitStepFailedFx: EffectHandler<"EmitStepFailed"> = async (
  effect: EmitStepFailedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newStepEmitterNewSpan(effect.scope, effect.traceId);
  await emitter.emit("step.failed", effect.data);
};
