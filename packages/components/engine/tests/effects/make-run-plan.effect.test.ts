import { describe, expect, it, vi } from "vitest";
import type { EffectHandlerDeps } from "../../src/engine.types.js";
import { makeRunPlanFx } from "../../src/effects/make-run-plan.effect.js";
import type { MakeRunPlanFx } from "../../src/types/effect.types.js";
import type { MakeRunPlanMsg } from "../../src/types/message.types.js";

describe("makeRunPlanFx()", () => {
  it("parses and enqueues a valid MakeRunPlanMsg object", async () => {
    const message: MakeRunPlanMsg = {
      type: "MakeRunPlan",
      runId: "test-runid",
    };

    const enqueue = vi.fn().mockReturnValue(undefined) as (
      message: string,
    ) => void;
    const processAll = vi.fn().mockReturnValue(undefined) as () => void;

    const effect: MakeRunPlanFx = {
      type: "MakeRunPlan",
      runId: "test-runid",
    };

    await makeRunPlanFx(effect, {
      enqueue,
      processAll,
    } as unknown as EffectHandlerDeps);

    expect(enqueue).toHaveBeenCalledExactlyOnceWith(message);
    expect(processAll).toHaveBeenCalledOnce();
  });
});
