import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitFlowCompletedFx,
} from "../engine.types.js";

export const emitFlowCompletedFx: EffectHandler<"EmitFlowCompleted"> = async (
  effect: EmitFlowCompletedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newFlowEmitterNewSpan(
    { ...effect.scope },
    effect.traceId,
  );
  await emitter.emit("flow.completed", effect.data);
};
