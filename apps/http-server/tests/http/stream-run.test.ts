import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamRun } from "../../src/http/routes/runs/stream-run.js";

const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function read(
  waitForRun: ReturnType<typeof vi.fn>,
  options: { heartbeatMs: number },
) {
  const app = Fastify();
  apps.push(app);
  app.get("/stream", async (_req, reply) => {
    await streamRun({
      reply,
      run: { waitForRun },
      runId: "run-1",
      ...options,
    });
  });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const response = await fetch(`${address}/stream`);
  return response.text();
}

describe("streamRun", () => {
  it("sends heartbeats while the run is still going", async () => {
    const waitForRun = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ status: "timeout" }), 60),
          ),
      );

    const body = await read(waitForRun, { heartbeatMs: 10 });

    expect(body.startsWith(`event: accepted\n`)).toBe(true);
    expect(body).toContain(": ping\n\n");
    expect(body.endsWith(`event: timeout\ndata: {"runId":"run-1"}\n\n`)).toBe(
      true,
    );
  });

  it("stops sending heartbeats once the run has ended", async () => {
    const waitForRun = vi.fn().mockResolvedValue({ status: "timeout" });

    const body = await read(waitForRun, { heartbeatMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(body).not.toContain(": ping");
  });

  it("reports a wait that throws as failed", async () => {
    const waitForRun = vi.fn().mockRejectedValue(new Error("boom"));

    const body = await read(waitForRun, { heartbeatMs: 1000 });

    expect(body).toContain(
      `event: failed\ndata: ${JSON.stringify({ ok: false, error: "boom" })}\n\n`,
    );
  });
});
