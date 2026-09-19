import { describe, expect, it } from "vitest";
import type { FlowDefinition } from "@lcase/types";
import { makeRunService } from "./helpers/make-run-service.js";

function request() {
  return {
    flowId: "flow-1",
    flowVersionId: "flow-version-1",
    flowDefHash: "flow-hash",
    source: "lowercase://test",
    runId: "run-1",
  };
}

describe("RunService refuses invalid ref positions", () => {
  it("refuses a binary param referenced inside an httpjson step's JSON body", async () => {
    const flow: FlowDefinition = {
      name: "Flow",
      version: "v1",
      params: { audio: { type: "audio/wav" } },
      start: "fetch",
      steps: {
        fetch: {
          type: "httpjson",
          url: "http://x",
          body: { prompt: "{{params.audio}}" },
        },
      },
    };
    const { service, runRepository } = makeRunService({ flow });

    await expect(service.requestRun(request())).rejects.toThrow(
      "Invalid step reference(s)",
    );
    expect(runRepository.createRun).not.toHaveBeenCalled();
  });
});
