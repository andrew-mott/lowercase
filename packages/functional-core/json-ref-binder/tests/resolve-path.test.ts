import { describe, expect, it } from "vitest";
import { resolvePath } from "../src/resolve-path.js";
import type { Path } from "@lcase/types";
describe("resolvePath()", () => {
  it("resolves a path correctly when path traverses object properties", () => {
    const object = {
      steps: { foo: { output: "bar" } },
    };
    const path: Path = ["steps", "foo", "output"];
    const value = resolvePath(path, object);
    expect(value).toBe("bar");
  });
  it("resolves a path correctly when path traverses array indices", () => {
    const object = {
      input: ["hello", ["bar"]],
    };
    const path: Path = ["input", 1, 0];
    const value = resolvePath(path, object);
    expect(value).toBe("bar");
  });
  it("resolves undefined when a path does not match object", () => {
    const object = {
      input: ["hello", ["bar"]],
    };
    const path: Path = ["input", 1, 2];
    const value = resolvePath(path, object);
    expect(value).toBe(undefined);
  });
});
