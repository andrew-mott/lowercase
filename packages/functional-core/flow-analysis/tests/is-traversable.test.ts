import { describe, expect, it } from "vitest";
import { isTraversable } from "../src/traverse.js";

describe("isTraversable()", () => {
  it("returns true for objects or arrays", () => {
    const emptyObject = isTraversable({});
    const objectWIthProperty = isTraversable({ key: "value" });
    const emptyArray = isTraversable([]);
    const numberArray = isTraversable([0, 1]);
    expect(emptyObject).toBe(true);
    expect(objectWIthProperty).toBe(true);
    expect(emptyArray).toBe(true);
    expect(numberArray).toBe(true);
  });
  it("returns false for primitive, null, and undefined", () => {
    const numberVal = isTraversable(4);
    const stringVal = isTraversable("string");
    const booleanVal = isTraversable(true);
    const nullVal = isTraversable(null);
    const undefinedVal = isTraversable(undefined);
    expect(numberVal).toBe(false);
    expect(stringVal).toBe(false);
    expect(booleanVal).toBe(false);
    expect(nullVal).toBe(false);
    expect(undefinedVal).toBe(false);
  });
});
