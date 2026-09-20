import { describe, expect, it } from "vitest";
import type { FlowDefinition } from "@lcase/types";
import { makeRunService } from "./helpers/make-run-service.js";

const flowWith = (payload: string): FlowDefinition => ({
  name: "Speak",
  version: "v1",
  start: "tts",
  steps: {
    tts: { type: "http", url: "http://localhost:8000/v1/audio/speech" },
  },
  outputs: { speech: { payload } },
});

const request = {
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  flowDefHash: "flow-hash",
  source: "lowercase://test",
  runId: "run-1",
};

describe("RunService with flow outputs", () => {
  it("accepts a flow whose output points at a step's output", async () => {
    const { service, runRepository } = makeRunService({
      flow: flowWith("{{steps.tts.output}}"),
    });

    await service.requestRun(request);

    expect(runRepository.createRun).toHaveBeenCalled();
  });

  it.each([
    ["a payload that isn't a whole reference", "audio: {{steps.tts.output}}"],
    ["a step that doesn't exist", "{{steps.ghost.output}}"],
    ["an export the step doesn't declare", "{{steps.tts.exports.text}}"],
  ])("refuses %s before creating a run", async (_label, payload) => {
    const { service, runRepository } = makeRunService({
      flow: flowWith(payload),
    });

    await expect(service.requestRun(request)).rejects.toThrow(
      "Invalid step reference(s)",
    );
    expect(runRepository.createRun).not.toHaveBeenCalled();
  });
});
