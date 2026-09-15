import { describe, it, expect } from "vitest";
import { parseExportRef, parseRef } from "../src/parse-references.js";
import type { FlowProblem, Ref } from "@lcase/types";

describe("getRegStrings()", () => {
  it("parses simple strings correctly", () => {
    const refs: Ref[] = [];
    parseRef("{{steps.bar}}", ["foo"], "stepId", refs, []);
    const expectedRefs: Ref[] = [
      {
        valuePath: ["steps", "bar"],
        scope: "steps",
        bindPath: ["foo"],
        stepId: "stepId",
        string: "steps.bar",
        interpolated: false,
        hash: null,
      },
    ];
    expect(refs).toEqual(expectedRefs);
  });
  it("parses simple strings correctly", () => {
    const refs: Ref[] = [];
    parseRef("{{steps.bar | json}}", ["foo"], "stepId", refs, []);
    const expectedRefs: Ref[] = [
      {
        valuePath: ["steps", "bar"],
        scope: "steps",
        bindPath: ["foo"],
        stepId: "stepId",
        string: "steps.bar",
        interpolated: false,
        hash: null,
        json: true,
      },
    ];
    expect(refs).toEqual(expectedRefs);
  });
  it("parses output export refs correctly", () => {
    const problems: FlowProblem[] = [];
    const ref = parseExportRef(
      {
        ref: "{{output.choices[0].message.content}}",
        type: "application/json",
      },
      "stepId",
      "parsed",
      problems,
    );

    expect(ref).toEqual({
      exportName: "parsed",
      valuePath: ["output", "choices", 0, "message", "content"],
      scope: "output",
      string: "output.choices[0].message.content",
      type: "application/json",
    });
    expect(problems).toEqual([]);
  });
  it("parses params refs correctly", () => {
    const refs: Ref[] = [];
    parseRef("{{params.payload.answer}}", ["foo"], "stepId", refs, []);
    expect(refs).toEqual([
      {
        valuePath: ["params", "payload", "answer"],
        scope: "params",
        bindPath: ["foo"],
        stepId: "stepId",
        string: "params.payload.answer",
        interpolated: false,
        hash: null,
      },
    ]);
  });
});
