import { describe, expect, it } from "vitest";
import type { AnyEvent } from "@lcase/types";
import { deriveStepRunInfo } from "@/components/workbench/shared/flow-graph/use-step-run-info";

function makeEvent(overrides: Partial<AnyEvent> & { type: string }): AnyEvent {
  return {
    id: "evt-1",
    source: "test",
    specversion: "1.0",
    time: new Date().toISOString(),
    ...overrides,
  } as unknown as AnyEvent;
}

describe("deriveStepRunInfo", () => {
  it("marks all steps initialized with no events", () => {
    expect(deriveStepRunInfo([], ["one", "two"])).toEqual({
      one: { status: "initialized" },
      two: { status: "initialized" },
    });
  });

  it("captures running status with no hashes yet", () => {
    const events = [
      makeEvent({
        type: "step.started",
        stepid: "one",
        data: { status: "started" },
      } as never),
    ];
    expect(deriveStepRunInfo(events, ["one"])).toEqual({
      one: {
        status: "running",
        outputHash: undefined,
        exportHashes: undefined,
        reason: undefined,
        matchedCase: undefined,
        sourceRunId: undefined,
      },
    });
  });

  it("captures outputHash, exportHashes, and matchedCase on completion", () => {
    const events = [
      makeEvent({
        type: "step.completed",
        stepid: "one",
        data: {
          status: "success",
          outputHash: "hash-out",
          exportHashes: { foo: "hash-foo" },
          matchedCase: "caseA",
        },
      } as never),
    ];
    const info = deriveStepRunInfo(events, ["one"]).one;
    expect(info.status).toBe("completed");
    expect(info.outputHash).toBe("hash-out");
    expect(info.exportHashes).toEqual({ foo: "hash-foo" });
    expect(info.matchedCase).toBe("caseA");
  });

  it("captures the failure reason", () => {
    const events = [
      makeEvent({
        type: "step.failed",
        stepid: "one",
        data: { status: "failure", reason: "boom" },
      } as never),
    ];
    expect(deriveStepRunInfo(events, ["one"]).one.reason).toBe("boom");
  });

  it("captures sourceRunId on reuse", () => {
    const events = [
      makeEvent({
        type: "step.reused",
        stepid: "one",
        data: {
          status: "success",
          sourceRunId: "run-123",
          outputHash: "hash-out",
        },
      } as never),
    ];
    const info = deriveStepRunInfo(events, ["one"]).one;
    expect(info.status).toBe("completed");
    expect(info.sourceRunId).toBe("run-123");
    expect(info.outputHash).toBe("hash-out");
  });
});
