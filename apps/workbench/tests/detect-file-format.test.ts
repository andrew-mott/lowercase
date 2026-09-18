import { describe, expect, it } from "vitest";
import { detectFileFormat } from "@/components/workbench/shared/detect-file-format";

function makeFile(name: string, mimetype: string): File {
  return new File(["content"], name, { type: mimetype });
}

describe("detectFileFormat", () => {
  it("detects json from extension + mimetype", () => {
    expect(detectFileFormat(makeFile("data.json", "application/json"))).toBe(
      "json",
    );
  });

  it("detects json from the octet-stream fallback mimetype", () => {
    expect(
      detectFileFormat(makeFile("data.json", "application/octet-stream")),
    ).toBe("json");
  });

  it("detects text from extension + mimetype", () => {
    expect(detectFileFormat(makeFile("notes.txt", "text/plain"))).toBe("text");
  });

  it("detects markdown from extension + mimetype, including the x-markdown variant", () => {
    expect(detectFileFormat(makeFile("prompt.md", "text/markdown"))).toBe(
      "markdown",
    );
    expect(detectFileFormat(makeFile("notes.md", "text/x-markdown"))).toBe(
      "markdown",
    );
  });

  it("falls back to bytes when the extension and mimetype don't match any known combination", () => {
    expect(detectFileFormat(makeFile("photo.png", "image/png"))).toBe("bytes");
  });

  it("falls back to bytes when the extension and mimetype disagree", () => {
    expect(detectFileFormat(makeFile("data.json", "text/plain"))).toBe("bytes");
  });
});
