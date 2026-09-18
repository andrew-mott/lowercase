import { describe, it, expect } from "vitest";
import { parseStepRefs } from "../src/parse-references.js";
import type { Ref, StepHttpJson } from "@lcase/types";

describe("parseStepRefs()", () => {
  it("returns empty array when no refs are found", () => {
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "test",
    };
    const r = parseStepRefs(httpStep, "stepId");

    const expectedOutput = {
      refs: [],
      exportRefs: {},
      problems: [],
    };

    expect(r).toEqual(expectedOutput);
  });
  it("returns correct ref when parse is valid", () => {
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "{{steps.foo}}",
    };
    const r = parseStepRefs(httpStep, "stepId");

    const expectedRefs: Ref[] = [
      {
        valuePath: ["steps", "foo"],
        scope: "steps",
        bindPath: ["url"],
        stepId: "stepId",
        string: "steps.foo",
        interpolated: false,
        hash: null,
      },
    ];

    const expectedOutput = {
      refs: expectedRefs,
      exportRefs: {},
      problems: [],
    };
    expect(r).toEqual(expectedOutput);
  });

  it("threads schema from an export declaration onto the export ref", () => {
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "test",
      exports: {
        data: {
          ref: "{{output.body}}",
          type: "application/json",
          schema: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      },
    };

    const r = parseStepRefs(httpStep, "stepId");

    expect(r.exportRefs).toEqual({
      data: {
        exportName: "data",
        valuePath: ["output", "body"],
        scope: "output",
        string: "output.body",
        type: "application/json",
        schema: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
      },
    });
    expect(r.problems).toEqual([]);
  });

  it("omits schema on the export ref when not declared", () => {
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "test",
      exports: {
        data: {
          ref: "{{output.body}}",
          type: "application/json",
        },
      },
    };

    const r = parseStepRefs(httpStep, "stepId");

    expect(r.exportRefs.data).not.toHaveProperty("schema");
  });
});
