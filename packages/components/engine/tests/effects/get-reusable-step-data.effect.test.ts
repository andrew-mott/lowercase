import { describe, expect, it, vi } from "vitest";
import type { RunQueryPort } from "@lcase/ports";
import type { EffectHandlerDeps } from "../../src/engine.types.js";
import { getReusableStepDataFx } from "../../src/effects/get-reusable-step-data.effect.js";
import type { GetReusableStepDataFx } from "../../src/types/effect.types.js";
import type { ReusableStepDataResultMsg } from "../../src/types/message.types.js";

describe("getReusableStepDataFx()", () => {
  it("parses and enqueues the correct message given valid reusable step data", async () => {
    const message: ReusableStepDataResultMsg = {
      ok: true,
      runId: "test-runid",
      reusableStepData: {
        b: {
          stepId: "b",
          status: "completed",
          outputHash: "test-outputhash",
          exportHashes: { body: "test-exporthash" },
        },
      },
      type: "ReusableStepDataResult",
    };
    const getReusableStepData = vi.fn().mockResolvedValue({
      ok: true,
      value: message.reusableStepData,
    });
    const enqueue = vi.fn().mockReturnValue(undefined) as (
      message: string,
    ) => void;
    const processAll = vi.fn().mockReturnValue(undefined) as () => void;

    const runQuery = { getReusableStepData } as unknown as RunQueryPort;

    const effect: GetReusableStepDataFx = {
      type: "GetReusableStepData",
      parentRunId: "test-parentrunid",
      stepIds: ["b"],
      runId: "test-runid",
    };

    await getReusableStepDataFx(effect, {
      runQuery,
      enqueue,
      processAll,
    } as unknown as EffectHandlerDeps);

    expect(getReusableStepData).toHaveBeenCalledExactlyOnceWith(
      "test-parentrunid",
      ["b"],
    );
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(message);
  });
  it("parses and enqueues an error message given a failed reusable step lookup", async () => {
    const message: ReusableStepDataResultMsg = {
      ok: false,
      runId: "test-runid",
      type: "ReusableStepDataResult",
      error: "Reusable step data not found for stepId: b",
    };

    const getReusableStepData = vi.fn().mockResolvedValue({
      ok: false,
      error: message.error,
    });
    const enqueue = vi.fn().mockReturnValue(undefined) as (
      message: string,
    ) => void;
    const processAll = vi.fn().mockReturnValue(undefined) as () => void;

    const runQuery = { getReusableStepData } as unknown as RunQueryPort;

    const effect: GetReusableStepDataFx = {
      type: "GetReusableStepData",
      parentRunId: "test-parentrunid",
      stepIds: ["b"],
      runId: "test-runid",
    };

    await getReusableStepDataFx(effect, {
      runQuery,
      enqueue,
      processAll,
    } as unknown as EffectHandlerDeps);

    expect(getReusableStepData).toHaveBeenCalledExactlyOnceWith(
      "test-parentrunid",
      ["b"],
    );
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(message);
  });
});
