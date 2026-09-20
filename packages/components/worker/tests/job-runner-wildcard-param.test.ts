import { describe, expect, it } from "vitest";
import type { Ref } from "@lcase/types";
import { makeContext, makeHttpWork } from "./helpers/fixtures.js";
import { makeJobRunner } from "./helpers/worker-fakes.js";

// A param declared as a type pattern is settled here, at load time: the
// engine only carries the declaration, so the worker checks the stored
// artifact against it and labels the request with the artifact's real type.
function audioRef(paramType: string): Ref {
  return {
    valuePath: ["audio"],
    scope: "params",
    stepId: "step-1",
    bindPath: ["body", "artifact"],
    string: "params.audio",
    interpolated: false,
    hash: "hash-audio",
    paramType,
  };
}

const audioWork = (paramType: string) =>
  makeHttpWork({
    protocol: {
      kind: "http",
      url: "https://example.test/transcribe",
      method: "POST",
      body: { artifact: "{{params.audio}}" },
    },
    refs: [audioRef(paramType)],
  });

describe("JobRunner with a wildcard-typed param", () => {
  it("sends the artifact under its stored type, not the declared pattern", async () => {
    const fakes = makeJobRunner();
    const bytes = new Uint8Array([1, 2, 3]);
    fakes.seed("hash-audio", "audio/webm", bytes);

    const outcome = await fakes.runner.run(audioWork("audio/*"), makeContext());

    expect(outcome.kind).toBe("completed");
    const [requestArg] = fakes.protocolExecute.mock.calls[0]!;
    expect(requestArg).toMatchObject({
      body: { kind: "artifact", value: { contentType: "audio/webm", bytes } },
      headers: { "Content-Type": "audio/webm" },
    });
  });

  it("fails input resolution when the stored type is outside the pattern", async () => {
    const fakes = makeJobRunner();
    fakes.seed("hash-audio", "video/mp4", new Uint8Array([1]));

    const outcome = await fakes.runner.run(audioWork("audio/*"), makeContext());

    expect(outcome).toMatchObject({
      kind: "failed",
      error: { code: "INPUT_RESOLUTION_FAILED" },
    });
    expect(fakes.protocolExecute).not.toHaveBeenCalled();
  });

  it("fails input resolution when the artifact does not exist", async () => {
    const fakes = makeJobRunner();

    const outcome = await fakes.runner.run(audioWork("audio/*"), makeContext());

    expect(outcome).toMatchObject({
      kind: "failed",
      error: { code: "INPUT_RESOLUTION_FAILED" },
    });
  });

  it("still requires an exact match when the param declares a concrete type", async () => {
    const fakes = makeJobRunner();
    fakes.seed("hash-audio", "audio/webm", new Uint8Array([1]));

    const outcome = await fakes.runner.run(
      audioWork("audio/wav"),
      makeContext(),
    );

    expect(outcome).toMatchObject({
      kind: "failed",
      error: { code: "INPUT_RESOLUTION_FAILED" },
    });
  });
});
