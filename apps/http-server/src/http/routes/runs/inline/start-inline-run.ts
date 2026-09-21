import type { Multipart } from "@fastify/multipart";
import type { ServicesPort } from "@lcase/ports";
import type { FastifyReply } from "fastify";
import { streamRun } from "../stream-run.js";
import { parseInlineRun } from "./parse-inline-run.js";
import { readInlineRunParts } from "./read-inline-run-parts.js";
import { storeInlineInputs } from "./store-inline-inputs.js";

type StartInlineRunInput = {
  services: Pick<ServicesPort, "run" | "artifact">;
  parts: AsyncIterable<Multipart>;
  reply: FastifyReply;
  waitTimeoutMs?: number;
};

/**
 * Starts a run from one multipart request and answers with the run's stream.
 * Anything wrong with the request is a real status with a JSON body, sent
 * before the stream begins; once the run exists, the outcome is in the stream.
 */
export async function startInlineRun({
  services,
  parts,
  reply,
  waitTimeoutMs,
}: StartInlineRunInput): Promise<void> {
  const fail = (status: number, error: string) =>
    reply.code(status).send({ ok: false, error });

  const read = await readInlineRunParts(parts);
  if (!read.ok) return fail(400, read.error);

  const run = parseInlineRun(read.run);
  if (!run.ok) return fail(400, run.error);

  const stored = await storeInlineInputs(services.artifact, read.inputs);
  if (!stored.ok)
    return fail(stored.kind === "invalid" ? 400 : 500, stored.error);

  const runId = services.run.makeRunId();
  try {
    await services.run.requestRun({
      ...run.value,
      source: "lowercase://http-server",
      runId,
      params: stored.params,
    });
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : String(error));
  }

  await streamRun({
    reply,
    run: services.run,
    runId,
    timeoutMs: waitTimeoutMs,
  });
}
