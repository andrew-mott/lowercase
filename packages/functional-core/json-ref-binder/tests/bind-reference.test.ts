import { describe, it, expect } from "vitest";
import { bindReference } from "../src/bind.js";
import type { Ref, StepHttpJson } from "@lcase/types";

describe("interplaceRef()", () => {
  it("does not interpolate when ref is not flagged as interpolated", () => {
    const ref: Ref = {
      valuePath: ["url"],
      scope: "steps",
      stepId: "test-stepId",
      bindPath: ["url"],
      string: "reference.string",
      interpolated: false,
      hash: null,
    };
    const step: StepHttpJson = {
      type: "httpjson",
      url: "test-url",
    };
    bindReference(ref, step, 5);
    expect(step.url).toBe(5);
  });
  it("interpolate when ref is not flagged as interpolated", () => {
    const ref: Ref = {
      valuePath: ["url"],
      scope: "steps",
      stepId: "test-stepId",
      bindPath: ["url"],
      string: "reference.string",
      interpolated: true,
      hash: null,
    };
    const step: StepHttpJson = {
      type: "httpjson",
      url: "url://test/{{reference.string}}",
    };
    bindReference(ref, step, "whatever");
    expect(step.url).toBe(`url://test/whatever`);
  });
  it("follows nested structures without interpolating", () => {
    const ref: Ref = {
      valuePath: ["foo", "bar"],
      scope: "steps",
      stepId: "test-stepId",
      bindPath: ["args", "foo", 1, 0, "other", "bar"],
      string: "foo.bar",
      interpolated: false,
      hash: null,
    };
    const step: StepHttpJson = {
      type: "httpjson",
      url: "url://test/{{reference.string}}",
      args: {
        foo: [0, [{ other: { bar: "{{foo.bar}}" } }]],
      },
    };
    bindReference(ref, step, { thing: true });
    expect(step.args).toEqual({
      foo: [0, [{ other: { bar: { thing: true } } }]],
    });
  });
  it("follows nested structures with interpolating", () => {
    const ref: Ref = {
      valuePath: ["foo", "bar"],
      scope: "steps",
      stepId: "test-stepId",
      bindPath: ["args", "foo", 1, 0, "other", "bar"],
      string: "foo.bar",
      interpolated: true,
      hash: null,
    };
    const step: StepHttpJson = {
      type: "httpjson",
      url: "url://test/{{reference.string}}",
      args: {
        foo: [0, [{ other: { bar: "hello {{foo.bar}}" } }]],
      },
    };
    bindReference(ref, step, { thing: true });
    expect(step.args).toEqual({
      foo: [0, [{ other: { bar: "hello { thing: true }" } }]],
    });
  });
});
