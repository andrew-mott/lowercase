import type { Multipart } from "@fastify/multipart";
import type { InlinePart } from "./inline-part.js";

// The part that describes the run. Every other part is an input, named after
// the param it feeds.
export const RUN_PART_NAME = "run";

export type InlineRunParts =
  | { ok: true; run: string; inputs: InlinePart[] }
  | { ok: false; error: string };

/**
 * Reads a multipart request in full and separates the `run` part from the
 * inputs. It only reads and sorts: it does not interpret the run or touch any
 * service.
 *
 * A part's content type is whatever the parser reports. The parser fills in
 * `text/plain` when a part sends none, and does not expose the raw headers, so
 * an unlabeled part cannot be told from a labeled text one here.
 */
export async function readInlineRunParts(
  parts: AsyncIterable<Multipart>,
): Promise<InlineRunParts> {
  let run: string | undefined;
  const inputs: InlinePart[] = [];
  const seen = new Set<string>();

  for await (const part of parts) {
    const name = part.fieldname;
    if (seen.has(name)) return { ok: false, error: `Duplicate part "${name}"` };
    seen.add(name);

    const buffer =
      part.type === "file"
        ? await part.toBuffer()
        : Buffer.from(String(part.value), "utf8");

    if (name === RUN_PART_NAME) {
      run = buffer.toString("utf8");
      continue;
    }

    inputs.push({
      name,
      contentType: part.mimetype,
      ...(part.type === "file" && part.filename
        ? { filename: part.filename }
        : {}),
      buffer,
    });
  }

  if (run === undefined) {
    return { ok: false, error: `Missing "${RUN_PART_NAME}" part` };
  }
  return { ok: true, run, inputs };
}
