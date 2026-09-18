import { describe, expect, it } from "vitest";
import {
  stringifyForPreview,
  truncateForPreview,
} from "@/components/workbench/flow-graph-panel/side-panel/step-results/preview-text";

describe("stringifyForPreview", () => {
  it("passes strings through unchanged", () => {
    expect(stringifyForPreview("hello")).toBe("hello");
  });

  it("pretty-prints non-string values as JSON", () => {
    expect(stringifyForPreview({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("truncateForPreview", () => {
  it("returns short text unchanged", () => {
    expect(truncateForPreview("hello")).toBe("hello");
  });

  it("truncates text past the max length with an ellipsis", () => {
    const text = "x".repeat(300);
    const result = truncateForPreview(text, 240);
    expect(result).toBe(`${"x".repeat(240)}…`);
  });

  it("uses 240 as the default max length", () => {
    const text = "x".repeat(300);
    expect(truncateForPreview(text)).toBe(`${"x".repeat(240)}…`);
  });
});
