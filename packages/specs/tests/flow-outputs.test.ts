import { describe, expect, it } from "vitest";
import { parseFlow } from "../src/parse-flow.js";

const flowWith = (outputs: unknown) => ({
  name: "speak",
  version: "1",
  start: "tts",
  steps: { tts: { type: "http", url: "http://localhost/v1/audio/speech" } },
  outputs,
});

describe("parseFlow with outputs", () => {
  it("accepts an output holding a payload", () => {
    const result = parseFlow(
      flowWith({ speech: { payload: "{{steps.tts.output}}" } }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a bare string in place of the object", () => {
    expect(parseFlow(flowWith({ speech: "{{steps.tts.output}}" })).ok).toBe(
      false,
    );
  });

  it("rejects a non-string payload", () => {
    expect(parseFlow(flowWith({ speech: { payload: 3 } })).ok).toBe(false);
  });

  it("rejects an output with no payload", () => {
    expect(parseFlow(flowWith({ speech: {} })).ok).toBe(false);
  });

  it("rejects unknown keys on an output", () => {
    const result = parseFlow(
      flowWith({ speech: { payload: "{{steps.tts.output}}", extra: 1 } }),
    );
    expect(result.ok).toBe(false);
  });
});
