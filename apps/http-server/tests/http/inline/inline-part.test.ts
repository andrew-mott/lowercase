import { describe, expect, it } from "vitest";
import { makeInlinePutInput } from "../../../src/http/routes/runs/inline/inline-part.js";

const part = (
  contentType: string,
  body: string | Uint8Array,
  filename?: string,
) => ({
  name: "input",
  contentType,
  filename,
  buffer: Buffer.from(body),
});

describe("makeInlinePutInput", () => {
  it("parses a json part that has no filename", () => {
    const result = makeInlinePutInput(part("application/json", '{"a":1}'));

    expect(result).toEqual({
      ok: true,
      value: {
        format: "json",
        value: { a: 1 },
        index: { filename: undefined, contentType: "application/json" },
      },
    });
  });

  it("rejects a json part that is not valid json, naming the part", () => {
    const result = makeInlinePutInput(part("application/json", "{nope"));

    expect(result).toEqual({
      ok: false,
      error: 'Part "input" is not valid JSON',
    });
  });

  it("decodes text and markdown parts as utf-8", () => {
    expect(makeInlinePutInput(part("text/plain", "héllo"))).toMatchObject({
      ok: true,
      value: { format: "text", value: "héllo" },
    });
    expect(makeInlinePutInput(part("text/markdown", "# hi"))).toMatchObject({
      ok: true,
      value: { format: "markdown", value: "# hi" },
    });
  });

  it("keeps anything else as the exact bytes, with its type and filename", () => {
    const bytes = new Uint8Array([0, 255, 128, 7]);

    const result = makeInlinePutInput(part("audio/webm", bytes, "clip.webm"));

    expect(result).toMatchObject({
      ok: true,
      value: {
        format: "bytes",
        index: { filename: "clip.webm", contentType: "audio/webm" },
      },
    });
    if (!result.ok || result.value.format !== "bytes") throw new Error("shape");
    expect(Buffer.from(result.value.value)).toEqual(Buffer.from(bytes));
  });

  it("does not treat octet-stream as json, whatever its filename", () => {
    const result = makeInlinePutInput(
      part("application/octet-stream", '{"a":1}', "data.json"),
    );

    expect(result).toMatchObject({ ok: true, value: { format: "bytes" } });
  });
});
