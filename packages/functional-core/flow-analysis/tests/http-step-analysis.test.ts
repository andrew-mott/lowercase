import { describe, expect, it } from "vitest";
import type { FlowDefinition } from "@lcase/types";
import { analyzeFlow } from "../src/analyze-flow.js";
import { analyzeRefs } from "../src/analyze-references.js";
import { stepExports } from "../src/step-exports.js";

// Speech-to-text, then an LLM pass over the transcript.
const flow: FlowDefinition = {
  name: "transcribe",
  version: "1",
  params: { audio: { type: "text/plain" } },
  start: "stt",
  steps: {
    stt: {
      type: "http",
      url: "http://localhost:8000/v1/audio/transcriptions",
      method: "POST",
      body: {
        multipart: {
          file: { artifact: "{{params.audio}}", filename: "input.wav" },
          model: "Systran/faster-distil-whisper-small.en",
        },
      },
      exports: { text: { ref: "{{output.text}}", type: "text/plain" } },
      on: { success: "fix", failure: "report" },
    },
    fix: {
      type: "http",
      url: "http://localhost:11434/api/generate",
      body: { json: { prompt: "Fix: {{steps.stt.exports.text}}" } },
    },
    report: { type: "httpjson", url: "http://localhost/report" },
  },
};

function analyze(definition: FlowDefinition) {
  const analysis = analyzeFlow(definition);
  analyzeRefs(definition, analysis);
  return analysis;
}

describe("flow analysis of http steps", () => {
  it("connects an http step to its success and failure steps", () => {
    const analysis = analyze(flow);
    expect(analysis.outEdges.stt).toEqual([
      expect.objectContaining({ endStepId: "fix", gate: "onSuccess" }),
      expect.objectContaining({ endStepId: "report", gate: "onFailure" }),
    ]);
    expect(analysis.problems).toEqual([]);
  });

  it("finds refs inside artifact parts and json bodies", () => {
    const refs = analyze(flow).refs.map((ref) => [ref.stepId, ref.bindPath]);
    expect(refs).toEqual(
      expect.arrayContaining([
        ["stt", ["body", "multipart", "file", "artifact"]],
        ["fix", ["body", "json", "prompt"]],
      ]),
    );
  });

  it("parses an http step's exports", () => {
    const analysis = analyze(flow);
    expect(analysis.exportRefsByStep?.stt?.text).toEqual(
      expect.objectContaining({ exportName: "text", type: "text/plain" }),
    );
  });

  it("refuses a path into a text export of an http step", () => {
    const withPath: FlowDefinition = {
      ...flow,
      steps: {
        ...flow.steps,
        fix: {
          type: "http",
          url: "http://localhost:11434/api/generate",
          body: { json: { prompt: "{{steps.stt.exports.text.first}}" } },
        },
      },
    };
    expect(analyze(withPath).problems).toEqual([
      expect.objectContaining({
        type: "InvalidExportRefPath",
        sourceStepId: "stt",
        exportName: "text",
      }),
    ]);
  });
});

describe("stepExports()", () => {
  it("returns exports for step types that declare them, else nothing", () => {
    expect(stepExports(flow.steps.stt)).toEqual({
      text: { ref: "{{output.text}}", type: "text/plain" },
    });
    expect(stepExports(flow.steps.report)).toBeUndefined();
    expect(
      stepExports({ type: "parallel", steps: ["a", "b"] }),
    ).toBeUndefined();
  });
});
