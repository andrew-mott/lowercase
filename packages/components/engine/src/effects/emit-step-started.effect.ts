import { emit } from "@lcase/events";
import type {
  EffectHandler,
  EffectHandlerDeps,
  EmitStepStartedFx,
} from "../engine.types.js";

export const emitStepStartedFx: EffectHandler<"EmitStepStarted"> = async (
  effect: EmitStepStartedFx,
  deps: EffectHandlerDeps,
) => {
  await emit(deps.bus, "step.started", effect.data, {
    ...effect.scope,
    source: deps.source,
    traceId: effect.traceId,
  });
};
