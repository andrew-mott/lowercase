import type { ArtifactPutInput, JsonValue } from "@lcase/types";
import { detectAuthoredFormat } from "../../artifacts/post-artifact.js";

// One input part of an inline run request, read in full. Its content type is
// always present: a part without one is rejected before this is built.
export type InlinePart = {
  name: string;
  contentType: string;
  filename?: string;
  buffer: Buffer;
};

/**
 * Decides how an input part is stored from its declared content type alone.
 * Text and JSON parts usually arrive without a filename, so unlike the
 * artifact upload route this cannot lean on one. Anything that is not JSON,
 * text or markdown is kept as the bytes it arrived as.
 */
export function makeInlinePutInput(
  part: InlinePart,
): { ok: true; value: ArtifactPutInput } | { ok: false; error: string } {
  const format = detectAuthoredFormat(part.contentType) ?? "bytes";
  const index = { filename: part.filename, contentType: part.contentType };

  switch (format) {
    case "json": {
      try {
        const value = JSON.parse(part.buffer.toString("utf8")) as JsonValue;
        return { ok: true, value: { format: "json", value, index } };
      } catch {
        return { ok: false, error: `Part "${part.name}" is not valid JSON` };
      }
    }
    case "text":
    case "markdown":
      return {
        ok: true,
        value: { format, value: part.buffer.toString("utf8"), index },
      };
    case "bytes":
      return {
        ok: true,
        value: { format: "bytes", value: part.buffer, index },
      };
  }
}
