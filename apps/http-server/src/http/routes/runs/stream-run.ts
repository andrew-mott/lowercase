import type { FastifyReply } from "fastify";
import type { RunServicePort } from "@lcase/ports";
import type { GetRunOutputsRes } from "@lcase/types";

export const HEARTBEAT_INTERVAL_MS = 20_000;

// How long one stream waits for its run before giving up. A run can hang, and
// its terminal write can fail to land, so the server must not hold a waiter and
// a connection open forever. Giving up does not touch the run.
export const DEFAULT_RUN_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

type StreamRunInput = {
  reply: FastifyReply;
  run: Pick<RunServicePort, "waitForRun">;
  runId: string;
  timeoutMs?: number;
  heartbeatMs?: number;
};

/**
 * Answers with a server-sent event stream for one run: `accepted` with its id,
 * heartbeats while it works, then one terminal message (`completed`, `failed`
 * or `timeout`) and the stream closes.
 *
 * The messages are this API's own, not the engine's events, so a caller never
 * learns the event taxonomy. The connection ending early does not cancel the
 * run; the caller can attach again by run id.
 */
export async function streamRun({
  reply,
  run,
  runId,
  timeoutMs = DEFAULT_RUN_WAIT_TIMEOUT_MS,
  heartbeatMs = HEARTBEAT_INTERVAL_MS,
}: StreamRunInput): Promise<void> {
  // @fastify/cors sets this in an onRequest hook, and hijack() bypasses
  // Fastify's own send path, so anything left on `reply` would be dropped
  // once we write to the raw response ourselves.
  const allowOrigin = reply.getHeader("access-control-allow-origin");

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...(typeof allowOrigin === "string"
      ? { "Access-Control-Allow-Origin": allowOrigin }
      : {}),
  });
  // Node holds headers back until the first body write. Sending them now is
  // what stops a client's headers timeout from firing on a long wait.
  reply.raw.flushHeaders();

  // The response, not the request: a request that has been fully read can
  // report closed while the caller is still listening.
  let closed = false;
  reply.raw.on("close", () => {
    closed = true;
  });

  const write = (chunk: string) => {
    if (closed) return;
    try {
      reply.raw.write(chunk);
    } catch (err) {
      console.error(`[stream-run] failed to write for run ${runId}: ${err}`);
    }
  };
  const send = (event: string, data: unknown) =>
    write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send("accepted", { runId });
  const heartbeat = setInterval(() => write(": ping\n\n"), heartbeatMs);

  try {
    const result = await run.waitForRun(runId, { timeoutMs });
    switch (result.status) {
      case "completed":
        send("completed", {
          ok: true,
          outputs: result.outputs,
        } satisfies GetRunOutputsRes);
        break;
      case "failed":
        send("failed", {
          ok: false,
          error: result.error,
        } satisfies GetRunOutputsRes);
        break;
      case "timeout":
        send("timeout", { runId });
        break;
    }
  } catch (err) {
    send("failed", {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearInterval(heartbeat);
    if (!closed) reply.raw.end();
  }
}
