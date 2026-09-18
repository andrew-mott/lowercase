import { describe, it, expect } from "vitest";
import { getRefStrings } from "../src/parse-references.js";

describe("getRegStrings()", () => {
  it("parses simple strings correctly", () => {
    const input = "{{steps.whatever}}";
    const matches = getRefStrings(input);
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("{{steps.whatever}}");
    expect(matches[0][1]).toBe("steps.whatever");
    expect(matches[0][2]).toBe("steps");
  });
  it("parses multiple simple strings correctly", () => {
    const input = "other text {{steps.foo}} and more {{steps.bar}}";
    const matches = getRefStrings(input);
    expect(matches.length).toBe(2);
    expect(matches[0][0]).toBe("{{steps.foo}}");
    expect(matches[0][1]).toBe("steps.foo");
    expect(matches[0][2]).toBe("steps");
    expect(matches[1][0]).toBe("{{steps.bar}}");
    expect(matches[1][1]).toBe("steps.bar");
    expect(matches[1][2]).toBe("steps");
  });
  it("parses input strings correctly", () => {
    const input = "{{input.foo}}";
    const matches = getRefStrings(input);
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("{{input.foo}}");
    expect(matches[0][1]).toBe("input.foo");
    expect(matches[0][2]).toBe("input");
  });
  it("parses env strings correctly", () => {
    const input = "{{env.foo}}";
    const matches = getRefStrings(input);
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("{{env.foo}}");
    expect(matches[0][1]).toBe("env.foo");
    expect(matches[0][2]).toBe("env");
  });

  it("parses object and array paths correctly", () => {
    const input = "{{env.foo.other[1].thing[2][3]}}";
    const matches = getRefStrings(input);
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("{{env.foo.other[1].thing[2][3]}}");
    expect(matches[0][1]).toBe("env.foo.other[1].thing[2][3]");
    expect(matches[0][2]).toBe("env");
  });
});
