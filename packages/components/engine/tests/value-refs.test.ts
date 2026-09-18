import { describe, expect, it } from "vitest";
import type { FlowDefinition, Ref, RunContext } from "@lcase/types";
import { getRefHash, makeStepRefs } from "../src/references/value-refs.js";

describe("value refs", () => {
  it("resolves export hashes for steps.<id>.exports.<name>", () => {
    const ref: Ref = {
      valuePath: ["steps", "foo", "exports", "parsed"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["body"],
      string: "steps.foo.exports.parsed",
      interpolated: false,
      hash: null,
    };
    const steps = {
      foo: {
        status: "completed",
        attempt: 1,
        output: null,
        outputHash: "output-hash",
        exportHashes: {
          parsed: "parsed-hash",
        },
        resolved: {},
      },
    } satisfies RunContext["steps"];
    const stepDefinitions: FlowDefinition["steps"] = {
      foo: {
        type: "httpjson",
        url: "url",
        exports: {
          parsed: { ref: "{{output.value}}", type: "text/markdown" },
        },
      },
    };

    expect(getRefHash(ref, steps, {})).toBe("parsed-hash");
    expect(
      makeStepRefs("bar", [ref], steps, {}, undefined, stepDefinitions),
    ).toEqual([
      {
        ...ref,
        valuePath: [],
        hash: "parsed-hash",
        exportType: "text/markdown",
      },
    ]);
  });

  it("keeps direct step output refs relative to the primary artifact", () => {
    const ref: Ref = {
      valuePath: ["steps", "foo", "body", "answer"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["body"],
      string: "steps.foo.body.answer",
      interpolated: false,
      hash: null,
    };
    const steps = {
      foo: {
        status: "completed",
        attempt: 1,
        output: null,
        outputHash: "output-hash",
        exportHashes: {},
        resolved: {},
      },
    } satisfies RunContext["steps"];

    expect(makeStepRefs("bar", [ref], steps, {})).toEqual([
      {
        ...ref,
        valuePath: ["body", "answer"],
        hash: "output-hash",
      },
    ]);
  });

  it("resolves param hashes for params.<name> refs", () => {
    const ref: Ref = {
      valuePath: ["params", "payload", "answer"],
      scope: "params",
      stepId: "bar",
      bindPath: ["body"],
      string: "params.payload.answer",
      interpolated: false,
      hash: null,
    };

    expect(getRefHash(ref, {}, { payload: "param-hash" })).toBe("param-hash");
    expect(
      makeStepRefs(
        "bar",
        [ref],
        {},
        { payload: "param-hash" },
        { payload: { type: "application/json" } },
      ),
    ).toEqual([
      {
        ...ref,
        valuePath: ["answer"],
        hash: "param-hash",
        paramType: "application/json",
      },
    ]);
  });
});
