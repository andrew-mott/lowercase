import { describe, expect, it, vi } from "vitest";
import { traverse } from "../src/traverse.js";

describe("isTraversable()", () => {
  it("handles empty objects correctly", () => {
    const handleValue = vi.fn().mockReturnValue(true);
    traverse({}, handleValue, []);
    expect(handleValue).not.toHaveBeenCalled();
  });
  it("handles empty arrays correctly", () => {
    const handleValue = vi.fn().mockReturnValue(true);
    traverse([], handleValue, []);
    expect(handleValue).not.toHaveBeenCalled();
  });
  it("handles arrays with primitives correctly", () => {
    const handleValue = vi.fn().mockReturnValue(true);
    traverse([4, true, "hello"], handleValue, []);
    expect(handleValue).toHaveBeenNthCalledWith(1, 4, [0]);
    expect(handleValue).toHaveBeenNthCalledWith(2, true, [1]);
    expect(handleValue).toHaveBeenNthCalledWith(3, "hello", [2]);
  });
  it("handles objects with primitives correctly", () => {
    const handleValue = vi.fn().mockReturnValue(true);
    traverse({ one: 4, two: true, three: "hello" }, handleValue, []);
    expect(handleValue).toHaveBeenNthCalledWith(1, 4, ["one"]);
    expect(handleValue).toHaveBeenNthCalledWith(2, true, ["two"]);
    expect(handleValue).toHaveBeenNthCalledWith(3, "hello", ["three"]);
  });
  it("handles deep object and array structures", () => {
    const handleValue = vi.fn().mockReturnValue(true);
    const data = {
      one: { field: 5 },
      two: [{ foo: true }, [4]],
    };
    traverse({ data }, handleValue, []);
    expect(handleValue).toHaveBeenNthCalledWith(1, 5, ["data", "one", "field"]);
    expect(handleValue).toHaveBeenNthCalledWith(2, true, [
      "data",
      "two",
      0,
      "foo",
    ]);
    expect(handleValue).toHaveBeenNthCalledWith(3, 4, ["data", "two", 1, 0]);
  });
});
