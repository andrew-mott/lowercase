import type { EffectHandler, EffectHandlerDeps } from "../engine.types.js";
import type { ResolveBranchValueFx } from "../types/effect.types.js";
import type { BranchValueResolvedMsg } from "../types/message.types.js";
import { resolveJsonPath } from "@lcase/json-ref-binder";

export const resolveBranchValueFx: EffectHandler<"ResolveBranchValue"> = async (
  effect: ResolveBranchValueFx,
  deps: EffectHandlerDeps,
) => {
  const { ref, cases, runId, stepId } = effect;

  const fail = (error: string) => {
    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId,
      stepId,
      ok: false,
      error,
    };
    deps.enqueue(message);
    deps.processAll();
  };

  if (ref.hash === null) {
    fail(`Could not resolve branch value ${ref.string}: no value available`);
    return;
  }

  const contentType = ref.exportType ?? ref.paramType ?? "application/json";
  let resolved: unknown;

  if (contentType === "application/json") {
    const result = await deps.artifacts.load(ref.hash, "application/json");
    if (!result.ok) {
      fail(
        `Could not resolve branch value ${ref.string}: ${result.error.message}`,
      );
      return;
    }
    resolved =
      ref.valuePath.length > 0
        ? resolveJsonPath(ref.valuePath, result.value)
        : result.value;
  } else {
    const result = await deps.artifacts.load(ref.hash, contentType);
    if (!result.ok) {
      fail(
        `Could not resolve branch value ${ref.string}: ${result.error.message}`,
      );
      return;
    }
    resolved = result.value;
  }

  const stringValue =
    resolved === undefined || resolved === null
      ? undefined
      : typeof resolved === "string"
        ? resolved
        : String(resolved);

  const matchedCase =
    stringValue !== undefined && stringValue in cases ? stringValue : null;

  const message: BranchValueResolvedMsg = {
    type: "BranchValueResolved",
    runId,
    stepId,
    ok: true,
    matchedCase,
  };
  deps.enqueue(message);
  deps.processAll();
};
