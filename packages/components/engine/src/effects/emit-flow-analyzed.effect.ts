import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitFlowAnalyzedFx,
} from "../engine.types.js";

export const emitFlowAnalyzedFx: EffectHandler<"EmitFlowAnalyzed"> = async (
  effect: EmitFlowAnalyzedFx,
  deps: EffectHandlerDeps,
) => {
  const emitter = deps.ef.newFlowEmitterNewSpan(
    { ...effect.scope },
    effect.traceId,
  );
  await emitter.emit("flow.analyzed", effect.data);
};
