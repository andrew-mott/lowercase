import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitRunCompletedFx,
} from "../engine.types.js";

/**
 * Emits a `run.completed` event, used to a stepPlanned
 * reducer + planner + effect combo.
 * @param effect EmitStepPlannedFx
 * @param deps EffectHandlerDeps
 */
export const emitRunCompletedFx: EffectHandler<"EmitRunCompleted"> = async (
  effect: EmitRunCompletedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newRunEmitterNewSpan({
    ...effect.scope,
    traceid: effect.traceId,
  });
  await emitter.emit("run.completed", effect.data);
};
