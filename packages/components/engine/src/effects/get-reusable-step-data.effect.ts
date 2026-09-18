import type { EffectHandler, EffectHandlerDeps } from "../engine.types.js";
import type { GetReusableStepDataFx } from "../types/effect.types.js";
import type { ReusableStepDataResultMsg } from "../types/message.types.js";

export const getReusableStepDataFx: EffectHandler<
  "GetReusableStepData"
> = async (effect: GetReusableStepDataFx, deps: EffectHandlerDeps) => {
  const result = await deps.runQuery.getReusableStepData(
    effect.parentRunId,
    effect.stepIds,
  );

  if (result.ok) {
    const message: ReusableStepDataResultMsg = {
      type: "ReusableStepDataResult",
      ok: true,
      runId: effect.runId,
      reusableStepData: result.value,
    };
    deps.enqueue(message);
    deps.processAll();
  } else {
    const message: ReusableStepDataResultMsg = {
      type: "ReusableStepDataResult",
      ok: false,
      error: result.error,
      runId: effect.runId,
    };
    deps.enqueue(message);
    deps.processAll();
  }
};
