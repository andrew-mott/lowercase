import { describe, expect, it } from "vitest";
import {
  defaultContentTypeForFormat,
  inferFormatFromContentType,
} from "../src/artifact-format.js";

describe("defaultContentTypeForFormat()", () => {
  it("maps each format to its canonical contentType", () => {
    expect(defaultContentTypeForFormat("json")).toBe("application/json");
    expect(defaultContentTypeForFormat("markdown")).toBe("text/markdown");
    expect(defaultContentTypeForFormat("text")).toBe("text/plain");
    expect(defaultContentTypeForFormat("bytes")).toBe(
      "application/octet-stream",
    );
  });
});

describe("inferFormatFromContentType()", () => {
  it("maps known contentTypes back to their format", () => {
    expect(inferFormatFromContentType("application/json")).toBe("json");
    expect(inferFormatFromContentType("text/markdown")).toBe("markdown");
    expect(inferFormatFromContentType("text/plain")).toBe("text");
  });

  it("treats any other text/* contentType as text", () => {
    expect(inferFormatFromContentType("text/csv")).toBe("text");
  });

  it("falls back to bytes for anything else", () => {
    expect(inferFormatFromContentType("application/octet-stream")).toBe(
      "bytes",
    );
    expect(inferFormatFromContentType("image/png")).toBe("bytes");
  });

  it("round-trips with defaultContentTypeForFormat", () => {
    for (const format of ["json", "markdown", "text", "bytes"] as const) {
      expect(
        inferFormatFromContentType(defaultContentTypeForFormat(format)),
      ).toBe(format);
    }
  });
});
