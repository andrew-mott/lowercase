import { describe, expect, it } from "vitest";
import { parseOutputPayload } from "../src/analyze-outputs.js";

describe("parseOutputPayload()", () => {
  it("reads a whole step output", () => {
    expect(parseOutputPayload("{{steps.tts.output}}")).toEqual({
      kind: "output",
      stepId: "tts",
    });
  });

  it("reads a step export", () => {
    expect(parseOutputPayload("{{steps.stt.exports.text}}")).toEqual({
      kind: "export",
      stepId: "stt",
      exportName: "text",
    });
  });

  it.each([
    ["plain text", "hello"],
    ["text around the reference", "audio: {{steps.tts.output}}"],
    ["two references", "{{steps.a.output}}{{steps.b.output}}"],
    ["a param reference", "{{params.audio}}"],
    ["an input reference", "{{input.audio}}"],
    ["a json transform", "{{steps.tts.output | json}}"],
    ["a path into the output", "{{steps.tts.output.audio}}"],
    ["an index into the output", "{{steps.tts.output[0]}}"],
    ["a path into an export", "{{steps.stt.exports.text.words}}"],
    ["an export with no name", "{{steps.stt.exports}}"],
    ["only a step", "{{steps.tts}}"],
    ["a step field that isn't output", "{{steps.tts.status}}"],
  ])("rejects %s", (_label, payload) => {
    expect(parseOutputPayload(payload)).toBeUndefined();
  });
});
