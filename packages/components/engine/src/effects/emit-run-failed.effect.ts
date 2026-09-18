import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitRunFailedFx,
} from "../engine.types.js";

/**
 * Emits a `run.completed` event, used to a stepPlanned
 * reducer + planner + effect combo.
 * @param effect EmitStepPlannedFx
 * @param deps EffectHandlerDeps
 */
export const emitRunFailedFx: EffectHandler<"EmitRunFailed"> = async (
  effect: EmitRunFailedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newRunEmitterNewSpan({
    ...effect.scope,
    traceid: effect.traceId,
  });
  await emitter.emit("run.failed", effect.data);
};
