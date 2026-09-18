import { describe, expect, it } from "vitest";
import { isArtifactCompatible } from "../src/artifact-compat.js";

describe("isArtifactCompatible()", () => {
  it("returns true when contentType matches exactly", () => {
    expect(isArtifactCompatible("application/json", "application/json")).toBe(
      true,
    );
    expect(isArtifactCompatible("text/plain", "text/plain")).toBe(true);
    expect(isArtifactCompatible("text/markdown", "text/markdown")).toBe(true);
  });

  it("returns false when contentType does not match", () => {
    expect(isArtifactCompatible("text/plain", "application/json")).toBe(false);
    expect(isArtifactCompatible("application/json", "text/markdown")).toBe(
      false,
    );
  });

  it("returns false when contentType is undefined", () => {
    expect(isArtifactCompatible(undefined, "application/json")).toBe(false);
  });
});
