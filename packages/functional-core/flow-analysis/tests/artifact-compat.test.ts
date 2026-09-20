import { describe, expect, it } from "vitest";
import {
  classifyContentType,
  isArtifactCompatible,
  isContentTypePattern,
} from "../src/artifact-compat.js";

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

describe("isArtifactCompatible() with a wildcard type", () => {
  it("matches any subtype of the declared type", () => {
    expect(isArtifactCompatible("audio/wav", "audio/*")).toBe(true);
    expect(isArtifactCompatible("audio/webm", "audio/*")).toBe(true);
    expect(isArtifactCompatible("audio/mp4", "audio/*")).toBe(true);
  });

  it("does not match another type, or a type that only shares the prefix text", () => {
    expect(isArtifactCompatible("video/mp4", "audio/*")).toBe(false);
    expect(isArtifactCompatible("audiobook/x", "audio/*")).toBe(false);
    expect(isArtifactCompatible("audio", "audio/*")).toBe(false);
  });

  it("returns false when contentType is undefined", () => {
    expect(isArtifactCompatible(undefined, "audio/*")).toBe(false);
  });
});

describe("isContentTypePattern()", () => {
  it("is true only for a type followed by /*", () => {
    expect(isContentTypePattern("audio/*")).toBe(true);
    expect(isContentTypePattern("text/*")).toBe(true);
  });

  it("is false for concrete types and unsupported wildcard forms", () => {
    expect(isContentTypePattern("audio/wav")).toBe(false);
    expect(isContentTypePattern("application/json")).toBe(false);
    expect(isContentTypePattern("*/*")).toBe(false);
    expect(isContentTypePattern("/*")).toBe(false);
  });
});

describe("classifyContentType()", () => {
  it("classifies application/json as json", () => {
    expect(classifyContentType("application/json")).toBe("json");
  });

  it("classifies any text/* MIME type as text", () => {
    expect(classifyContentType("text/plain")).toBe("text");
    expect(classifyContentType("text/markdown")).toBe("text");
    expect(classifyContentType("text/csv")).toBe("text");
  });

  it("classifies everything else as binary, including real text formats outside text/*", () => {
    expect(classifyContentType("audio/wav")).toBe("binary");
    expect(classifyContentType("application/xml")).toBe("binary");
  });
});
