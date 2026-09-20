import { describe, expect, it } from "vitest";
import type { FlowDefinition } from "@lcase/types";
import { makeRunService } from "./helpers/make-run-service.js";

const flow: FlowDefinition = {
  name: "Transcribe",
  version: "v1",
  params: { audio: { type: "audio/*" } },
  start: "a",
  steps: {
    a: {
      type: "http",
      url: "http://localhost:8000/v1/audio/transcriptions",
      body: { artifact: "{{params.audio}}" },
    },
  },
};

const request = {
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  flowDefHash: "flow-hash",
  source: "lowercase://test",
  runId: "run-1",
  params: { audio: "audio-hash" },
};

describe("RunService with an audio/* param", () => {
  it.each(["audio/wav", "audio/webm", "audio/mp4"])(
    "accepts a run param stored as %s",
    async (contentType) => {
      const { service, runRepository } = makeRunService({
        flow,
        artifact: { contentType, format: "bytes" },
      });

      await service.requestRun(request);

      expect(runRepository.createRun).toHaveBeenCalled();
    },
  );

  it("refuses a run param outside the pattern before creating a run", async () => {
    const { service, runRepository } = makeRunService({
      flow,
      artifact: { contentType: "text/plain", format: "text" },
    });

    await expect(service.requestRun(request)).rejects.toThrow(
      "Run param audio requires audio/*, received text/plain",
    );
    expect(runRepository.createRun).not.toHaveBeenCalled();
  });
});
