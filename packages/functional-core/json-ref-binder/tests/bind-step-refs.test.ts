import { describe, it, expect } from "vitest";
import { bindStepRefs } from "../src/bind.js";
import type { Ref, StepHttpJson } from "@lcase/types";

describe("bindStepRefs()", () => {
  it("replaces refs with a correct materialized view", () => {
    const ref: Ref[] = [
      {
        valuePath: ["reference", "string"],
        scope: "steps",
        stepId: "test-stepId",
        bindPath: ["url"],
        string: "reference.string",
        interpolated: false,
        hash: null,
      },
      {
        valuePath: ["foo", "bar"],
        scope: "steps",
        stepId: "test-stepId",
        bindPath: ["args", "other"],
        string: "foo.bar",
        interpolated: true,
        hash: null,
      },
    ];
    const resolved: Record<string, unknown> = {
      "reference.string": 5,
      "foo.bar": "fred",
    };
    const step: StepHttpJson = {
      type: "httpjson",
      url: "{{reference.string}}",
      args: {
        thing: 3,
        other: "My Name Is: {{foo.bar}}",
      },
    };
    const materializedStep = bindStepRefs(ref, resolved, step);
    expect(materializedStep.url).toBe(5);
    expect(materializedStep.args?.other).toBe("My Name Is: fred");
  });
});
