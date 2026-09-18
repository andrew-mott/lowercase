import { describe, expect, it, vi } from "vitest";
import type { ArtifactReaderPort } from "@lcase/ports";
import type { EffectHandlerDeps } from "../../src/engine.types.js";
import { resolveBranchValueFx } from "../../src/effects/resolve-branch-value.effect.js";
import type { ResolveBranchValueFx } from "../../src/types/effect.types.js";
import type { BranchValueResolvedMsg } from "../../src/types/message.types.js";
import type { Ref } from "@lcase/types";

const baseRef: Ref = {
  valuePath: ["intent"],
  scope: "steps",
  stepId: "routeintent",
  bindPath: ["value"],
  string: "steps.llmweather.exports.data.intent",
  interpolated: false,
  hash: "test-hash",
  exportType: "application/json",
};

describe("resolveBranchValueFx()", () => {
  it("resolves matchedCase when the value matches a declared case", async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { intent: "forecast" } });
    const enqueue = vi.fn();
    const processAll = vi.fn();

    const effect: ResolveBranchValueFx = {
      type: "ResolveBranchValue",
      runId: "test-runid",
      stepId: "routeintent",
      ref: baseRef,
      cases: { forecast: "getforecast", airquality: "getairquality" },
    };

    await resolveBranchValueFx(effect, {
      artifacts: { load } as unknown as ArtifactReaderPort,
      enqueue,
      processAll,
    } as unknown as EffectHandlerDeps);

    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId: "test-runid",
      stepId: "routeintent",
      ok: true,
      matchedCase: "forecast",
    };
    expect(load).toHaveBeenCalledExactlyOnceWith(
      "test-hash",
      "application/json",
    );
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(message);
    expect(processAll).toHaveBeenCalledOnce();
  });

  it("resolves matchedCase to null when the value matches no declared case", async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { intent: "something-else" } });
    const enqueue = vi.fn();
    const processAll = vi.fn();

    const effect: ResolveBranchValueFx = {
      type: "ResolveBranchValue",
      runId: "test-runid",
      stepId: "routeintent",
      ref: baseRef,
      cases: { forecast: "getforecast", airquality: "getairquality" },
    };

    await resolveBranchValueFx(effect, {
      artifacts: { load } as unknown as ArtifactReaderPort,
      enqueue,
      processAll,
    } as unknown as EffectHandlerDeps);

    const message: BranchValueResolvedMsg = {
      type: "BranchValueResolved",
      runId: "test-runid",
      stepId: "routeintent",
      ok: true,
      matchedCase: null,
    };
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(message);
  });

  it("enqueues an error message when the CAS fetch fails", async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { message: "not found" } });
    const enqueue = vi.fn();
    const processAll = vi.fn();

    const effect: ResolveBranchValueFx = {
      type: "ResolveBranchValue",
      runId: "test-runid",
      stepId: "routeintent",
      ref: baseRef,
      cases: { forecast: "getforecast" },
    };

    await resolveBranchValueFx(effect, {
      artifacts: { load } as unknown as ArtifactReaderPort,
      enqueue,
      processAll,
    } as unknown as EffectHandlerDeps);

    expect(enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "BranchValueResolved", ok: false }),
    );
  });

  it("enqueues an error message when the ref has no hash", async () => {
    const load = vi.fn();
    const enqueue = vi.fn();
    const processAll = vi.fn();

    const effect: ResolveBranchValueFx = {
      type: "ResolveBranchValue",
      runId: "test-runid",
      stepId: "routeintent",
      ref: { ...baseRef, hash: null },
      cases: { forecast: "getforecast" },
    };

    await resolveBranchValueFx(effect, {
      artifacts: { load } as unknown as ArtifactReaderPort,
      enqueue,
      processAll,
    } as unknown as EffectHandlerDeps);

    expect(load).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "BranchValueResolved", ok: false }),
    );
  });
});
