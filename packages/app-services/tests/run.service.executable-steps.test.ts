import { describe, expect, it } from "vitest";
import type { FlowDefinition, StepDefinition } from "@lcase/types";
import { makeRunService } from "./helpers/make-run-service.js";

const httpStep: StepDefinition = {
  type: "http",
  url: "http://localhost:8000/v1/audio/transcriptions",
  body: { artifact: "{{params.audio}}" },
};

const mcpStep: StepDefinition = {
  type: "mcp",
  url: "http://localhost:9000/mcp",
  transport: "http",
  feature: { primitive: "tool", name: "search" },
};

function flowWith(steps: Record<string, StepDefinition>): FlowDefinition {
  return { name: "Flow", version: "v1", start: "a", steps };
}

function request() {
  return {
    flowId: "flow-1",
    flowVersionId: "flow-version-1",
    flowDefHash: "flow-hash",
    source: "lowercase://test",
    runId: "run-1",
  };
}

describe("RunService refuses steps nothing executes", () => {
  it("accepts an http step, which the engine now dispatches", async () => {
    const { service, runRepository } = makeRunService({
      flow: {
        ...flowWith({ a: httpStep }),
        params: { audio: { type: "audio/wav" } },
      },
      artifact: { contentType: "audio/wav", format: "bytes" },
    });

    await service.requestRun({
      ...request(),
      params: { audio: "audio-hash" },
    });

    expect(runRepository.createRun).toHaveBeenCalled();
  });

  it("refuses an mcp step before creating a run", async () => {
    const { service, runRepository } = makeRunService({
      flow: flowWith({ a: mcpStep }),
    });

    await expect(service.requestRun(request())).rejects.toThrow(
      "Flow has steps that cannot run yet: a (mcp)",
    );
    expect(runRepository.createRun).not.toHaveBeenCalled();
  });

  it("names every refused step", async () => {
    const { service } = makeRunService({
      flow: flowWith({
        a: { type: "httpjson", url: "http://x", on: { success: "b" } },
        b: mcpStep,
        c: { ...mcpStep, feature: { primitive: "tool", name: "other" } },
      }),
    });

    await expect(service.requestRun(request())).rejects.toThrow(
      "Flow has steps that cannot run yet: b (mcp), c (mcp)",
    );
  });
});
