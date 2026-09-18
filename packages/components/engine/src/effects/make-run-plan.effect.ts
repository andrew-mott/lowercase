import type { EffectHandler, EffectHandlerDeps } from "../engine.types.js";
import type { MakeRunPlanFx } from "../types/effect.types.js";
import type { MakeRunPlanMsg } from "../types/message.types.js";

export const makeRunPlanFx: EffectHandler<"MakeRunPlan"> = (
  effect: MakeRunPlanFx,
  deps: EffectHandlerDeps,
) => {
  const message: MakeRunPlanMsg = {
    type: "MakeRunPlan",
    runId: effect.runId,
  };
  deps.enqueue(message);
  deps.processAll();
};
