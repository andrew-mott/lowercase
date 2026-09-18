import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitStepCompletedFx,
} from "../engine.types.js";

/**
 * Emits a `step.planned` event, used to a stepPlanned
 * reducer + planner + effect combo.
 * @param effect EmitStepPlannedFx
 * @param deps EffectHandlerDeps
 */
export const emitStepCompletedFx: EffectHandler<"EmitStepCompleted"> = async (
  effect: EmitStepCompletedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newStepEmitterNewSpan(effect.scope, effect.traceId);
  await emitter.emit("step.completed", effect.data);
};
