import { describe, expect, it } from "vitest";
import type { FlowDefinition } from "@lcase/types";
import { resolveFlowOutputs } from "../src/resolve-flow-outputs.js";

const flow = (outputs?: Record<string, string>): FlowDefinition => ({
  name: "speak",
  version: "1",
  start: "tts",
  steps: { tts: { type: "http", url: "http://localhost/speech" } },
  ...(outputs && {
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, payload]) => [name, { payload }]),
    ),
  }),
});

describe("resolveFlowOutputs()", () => {
  it("returns the hash of a step's whole output", () => {
    const results = resolveFlowOutputs(
      flow({ speech: "{{steps.tts.output}}" }),
      [{ stepId: "tts", status: "success", outputHash: "abc" }],
    );
    expect(results).toEqual({ speech: { ok: true, value: { hash: "abc" } } });
  });

  it("returns the hash of a named export", () => {
    const results = resolveFlowOutputs(
      flow({ text: "{{steps.tts.exports.text}}" }),
      [
        {
          stepId: "tts",
          status: "success",
          outputHash: "abc",
          exports: [
            { name: "other", artifactHash: "111" },
            { name: "text", artifactHash: "def" },
          ],
        },
      ],
    );
    expect(results).toEqual({ text: { ok: true, value: { hash: "def" } } });
  });

  it("reports a failed step even when a hash was recorded", () => {
    const results = resolveFlowOutputs(
      flow({ speech: "{{steps.tts.output}}" }),
      [{ stepId: "tts", status: "failure", outputHash: "abc" }],
    );
    expect(results).toEqual({
      speech: { ok: false, error: { reason: "step-failed" } },
    });
  });

  it("reports a step that has no record as not produced", () => {
    const results = resolveFlowOutputs(
      flow({ speech: "{{steps.tts.output}}" }),
      [],
    );
    expect(results).toEqual({
      speech: { ok: false, error: { reason: "not-produced" } },
    });
  });

  it("reports a succeeded step missing the named export as not produced", () => {
    const results = resolveFlowOutputs(
      flow({ text: "{{steps.tts.exports.text}}" }),
      [{ stepId: "tts", status: "success", outputHash: "abc", exports: [] }],
    );
    expect(results).toEqual({
      text: { ok: false, error: { reason: "not-produced" } },
    });
  });

  it("reports a payload it can't read as not produced instead of throwing", () => {
    const results = resolveFlowOutputs(flow({ speech: "nope" }), [
      { stepId: "tts", status: "success", outputHash: "abc" },
    ]);
    expect(results.speech).toEqual({
      ok: false,
      error: { reason: "not-produced" },
    });
  });

  it("gives every declared output an entry", () => {
    const results = resolveFlowOutputs(
      flow({ a: "{{steps.tts.output}}", b: "{{steps.nope.output}}" }),
      [{ stepId: "tts", status: "success", outputHash: "abc" }],
    );
    expect(Object.keys(results)).toEqual(["a", "b"]);
  });

  it("returns nothing for a flow with no outputs", () => {
    expect(resolveFlowOutputs(flow(), [])).toEqual({});
  });
});
