import type { Multipart } from "@fastify/multipart";
import { describe, expect, it } from "vitest";
import { readInlineRunParts } from "../../../src/http/routes/runs/inline/read-inline-run-parts.js";

const field = (fieldname: string, value: string, mimetype = "text/plain") =>
  ({ type: "field", fieldname, value, mimetype }) as unknown as Multipart;

const file = (
  fieldname: string,
  body: Uint8Array | string,
  mimetype: string,
  filename = "blob",
) =>
  ({
    type: "file",
    fieldname,
    filename,
    mimetype,
    toBuffer: async () => Buffer.from(body),
  }) as unknown as Multipart;

async function* parts(...items: Multipart[]) {
  for (const item of items) yield item;
}

describe("readInlineRunParts", () => {
  it("separates the run part from the inputs", async () => {
    const bytes = new Uint8Array([0, 255, 7]);

    const result = await readInlineRunParts(
      parts(
        field("run", '{"flowId":"f"}', "application/json"),
        file("audio", bytes, "audio/webm", "clip.webm"),
        field("note", "hello"),
      ),
    );

    expect(result).toEqual({
      ok: true,
      run: '{"flowId":"f"}',
      inputs: [
        {
          name: "audio",
          contentType: "audio/webm",
          filename: "clip.webm",
          buffer: Buffer.from(bytes),
        },
        {
          name: "note",
          contentType: "text/plain",
          buffer: Buffer.from("hello"),
        },
      ],
    });
  });

  it("reads a run part sent as a file", async () => {
    const result = await readInlineRunParts(
      parts(file("run", '{"flowId":"f"}', "application/json")),
    );

    expect(result).toMatchObject({
      ok: true,
      run: '{"flowId":"f"}',
      inputs: [],
    });
  });

  it("rejects a request with no run part", async () => {
    const result = await readInlineRunParts(parts(field("note", "hello")));

    expect(result).toEqual({ ok: false, error: 'Missing "run" part' });
  });

  it("rejects a part name that appears twice", async () => {
    const result = await readInlineRunParts(
      parts(field("run", "{}"), field("note", "a"), field("note", "b")),
    );

    expect(result).toEqual({ ok: false, error: 'Duplicate part "note"' });
  });
});
