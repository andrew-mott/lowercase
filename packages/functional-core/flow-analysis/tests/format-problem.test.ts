import { describe, expect, it } from "vitest";
import { formatProblem } from "../src/format-problem.js";

describe("formatProblem() for flow outputs", () => {
  it("names the output and its payload", () => {
    expect(
      formatProblem({
        type: "InvalidFlowOutputPayload",
        outputName: "speech",
        payloadDefinition: "nope",
      }),
    ).toBe(
      `Flow output "speech" has payload "nope", which isn't a single reference to a step's output or export.`,
    );
  });

  it.each([
    ["unknown-step", "which doesn't exist"],
    ["undeclared-export", "doesn't declare"],
    ["no-output", "doesn't produce one"],
  ] as const)("explains a %s target", (reason, fragment) => {
    const message = formatProblem({
      type: "InvalidFlowOutputTarget",
      outputName: "speech",
      targetStepId: "tts",
      reason,
    });
    expect(message).toContain(`Flow output "speech"`);
    expect(message).toContain(fragment);
  });
});
