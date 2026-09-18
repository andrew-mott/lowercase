import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitFlowFailedFx,
} from "../engine.types.js";

export const emitFlowFailedFx: EffectHandler<"EmitFlowFailed"> = async (
  effect: EmitFlowFailedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newFlowEmitterNewSpan(
    { ...effect.scope },
    effect.traceId,
  );
  await emitter.emit("flow.failed", effect.data);
};
