import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitRunStartedFx,
} from "../engine.types.js";

/**
 * Emits new `run.started` event, used to kick off the
 * runStarted reducer + planner + effects.
 * @param effect EmitRunStartedFx
 * @param deps EffectHandlerDeps
 */
export const emitRunStartedFx: EffectHandler<"EmitRunStarted"> = async (
  effect: EmitRunStartedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newRunEmitterNewSpan({
    ...effect.scope,
    traceid: effect.traceId,
  });

  await emitter.emit("run.started", effect.data);
};
