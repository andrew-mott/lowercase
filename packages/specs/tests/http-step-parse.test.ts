import { describe, expect, it } from "vitest";
import { parseFlow } from "../src/parse-flow.js";

const flowWith = (step: unknown) => ({
  name: "transcribe",
  version: "1",
  start: "stt",
  steps: { stt: step },
});

const transcribeStep = {
  type: "http",
  url: "http://localhost:8000/v1/audio/transcriptions",
  method: "POST",
  body: {
    multipart: {
      file: { artifact: "{{params.audio}}", filename: "input.wav" },
      model: "Systran/faster-distil-whisper-small.en",
    },
  },
  exports: { text: { ref: "text", type: "text/plain" } },
  on: { success: "fix" },
};

describe("parseFlow with an http step", () => {
  it("accepts each body kind", () => {
    const bodies = [
      transcribeStep.body,
      { artifact: "{{params.audio}}" },
      { json: { input: "{{steps.stt.exports.text}}" } },
    ];
    for (const body of bodies) {
      const result = parseFlow(flowWith({ ...transcribeStep, body }));
      expect(result.ok).toBe(true);
    }
  });

  it("returns the step unchanged", () => {
    const result = parseFlow(flowWith(transcribeStep));
    expect(result.ok && result.value.steps.stt).toEqual(transcribeStep);
  });

  it("reports AJV's problem at the step's path", () => {
    const result = parseFlow(flowWith({ ...transcribeStep, headrs: {} }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issues = JSON.parse(result.error);
    expect(issues).toEqual([
      expect.objectContaining({
        path: ["steps", "stt"],
        message: 'unknown field "headrs"',
      }),
    ]);
  });

  it("leaves other step types to the Zod union", () => {
    const valid = parseFlow(flowWith({ type: "httpjson", url: "http://x" }));
    expect(valid.ok).toBe(true);

    const invalid = parseFlow(flowWith({ type: "httpjson" }));
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(JSON.parse(invalid.error)[0].path).toEqual(["steps", "stt", "url"]);
  });

  it("rejects an unknown step type as before", () => {
    const result = parseFlow(flowWith({ type: "nope", url: "http://x" }));
    expect(result.ok).toBe(false);
  });
});
