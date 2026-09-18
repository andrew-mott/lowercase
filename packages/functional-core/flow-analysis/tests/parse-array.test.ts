import { describe, expect, it } from "vitest";
import { parseArray } from "../src/parse-references.js";
describe("makePath()", () => {
  it("parseArray parses correctly", () => {
    const reference = "press[1][24][2]";
    const parts = parseArray(reference);
    const results = { key: "press", index: ["1", "24", "2"] };
    expect(parts).toEqual(results);
  });
  it("parseArray parses correctly", () => {
    const reference = "thing";
    const parts = parseArray(reference);
    const results = { key: "thing", index: [] };
    expect(parts).toEqual(results);
  });
});
