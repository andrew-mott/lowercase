import { describe, it, expect } from "vitest";
import { interpolateRef } from "../src/bind.js";
import type { Ref } from "@lcase/types";

describe("interplaceRef()", () => {
  it("does not interpolate when ref is not flagged as interpolated", () => {
    const ref: Ref = {
      valuePath: [],
      scope: "steps",
      stepId: "",
      bindPath: [],
      string: "",
      interpolated: false,
      hash: null,
    };
    const result = interpolateRef("", "bar", ref);
    expect(result).toBe("bar");
  });
  it("interpolates when ref flagged as interpolated and field is a string", () => {
    const ref: Ref = {
      valuePath: [],
      scope: "steps",
      stepId: "",
      bindPath: [],
      string: "place",
      interpolated: true,
      hash: null,
    };
    const result = interpolateRef("Hello {{place}}", "bar", ref);
    expect(result).toBe("Hello bar");
  });

  it("interpolates numbers when ref flagged as interpolated and field is a string", () => {
    const ref: Ref = {
      valuePath: [],
      scope: "steps",
      stepId: "",
      bindPath: [],
      string: "place",
      interpolated: true,
      hash: null,
    };
    const result = interpolateRef("Hello {{place}}", 5, ref);
    expect(result).toBe("Hello 5");
  });

  it("returns value when interpolated is set but field is not a string", () => {
    const ref: Ref = {
      valuePath: [],
      scope: "steps",
      stepId: "",
      bindPath: [],
      string: "place",
      interpolated: true,
      hash: null,
    };
    const result = interpolateRef(5, "bar", ref);
    expect(result).toBe("bar");
  });
});
