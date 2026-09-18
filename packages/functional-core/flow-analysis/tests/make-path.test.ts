import { describe, expect, it } from "vitest";
import { makePath } from "../src/parse-references.js";
describe("makePath()", () => {
  it("parses objects and arrays correctly", () => {
    const reference = "test[0].thing.other[4][5]";
    const path = makePath(reference);
    const expectedPath = ["test", 0, "thing", "other", 4, 5];
    expect(path).toEqual(expectedPath);
  });
});
