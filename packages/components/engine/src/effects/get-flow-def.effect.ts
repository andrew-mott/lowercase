import type { EffectHandler, EffectHandlerDeps } from "../engine.types.js";
import type { GetFlowDefFx } from "../types/effect.types.js";
import type { FlowDefResultMsg } from "../types/message.types.js";
import { parseFlow } from "@lcase/specs";

export const getFlowDefFx: EffectHandler<"GetFlowDef"> = async (
  effect: GetFlowDefFx,
  deps: EffectHandlerDeps,
) => {
  const json = await deps.artifacts.load(effect.hash, "application/json");

  if (!json.ok) {
    const message: FlowDefResultMsg = {
      type: "FlowDefResult",
      ok: false,
      error: json.error.message,
      runId: effect.runId,
    };
    deps.enqueue(message);
    deps.processAll();
    return;
  }

  const parseResult = parseFlow(json.value);
  if (!parseResult.ok) {
    const message: FlowDefResultMsg = {
      type: "FlowDefResult",
      ok: false,
      runId: effect.runId,
      error: parseResult.error,
    };
    deps.enqueue(message);
    deps.processAll();
    return;
  }
  const message: FlowDefResultMsg = {
    type: "FlowDefResult",
    def: parseResult.value,
    ok: true,
    runId: effect.runId,
  };
  deps.enqueue(message);
  deps.processAll();
  return;
};
