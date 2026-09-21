import Fastify from "fastify";
import type { ServicesPort } from "@lcase/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRunStreamRoute } from "../../src/http/routes/runs/get-run-stream.js";

const outputs = {
  speech: { ok: true, hash: "a".repeat(64), contentType: "audio/wav" },
};

type Run = {
  getRunDetail: ReturnType<typeof vi.fn>;
  waitForRun: ReturnType<typeof vi.fn>;
};

const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(run: Partial<Run>, waitTimeoutMs?: number) {
  const app = Fastify();
  apps.push(app);
  app.decorate("services", { run } as unknown as ServicesPort);
  await app.register(getRunStreamRoute, { prefix: "/api/runs", waitTimeoutMs });
  return app;
}

// A stream is only readable while the server is listening, so this reads the
// whole response of a real request.
async function readStream(
  app: Awaited<ReturnType<typeof makeApp>>,
  id: string,
) {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const response = await fetch(`${address}/api/runs/${id}/stream`);
  return { response, body: await response.text() };
}

describe("run stream route", () => {
  it("sends accepted and then the run's outputs as completed", async () => {
    const run = {
      getRunDetail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
      waitForRun: vi.fn().mockResolvedValue({ status: "completed", outputs }),
    };
    const app = await makeApp(run);

    const { response, body } = await readStream(app, "run-1");

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(body).toBe(
      `event: accepted\ndata: {"runId":"run-1"}\n\n` +
        `event: completed\ndata: ${JSON.stringify({ ok: true, outputs })}\n\n`,
    );
    expect(run.waitForRun).toHaveBeenCalledWith("run-1", {
      timeoutMs: expect.any(Number),
    });
  });

  it("sends failed with the error", async () => {
    const run = {
      getRunDetail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
      waitForRun: vi
        .fn()
        .mockResolvedValue({ status: "failed", error: "Run failed" }),
    };
    const app = await makeApp(run);

    const { body } = await readStream(app, "run-1");

    expect(body).toContain(
      `event: failed\ndata: ${JSON.stringify({ ok: false, error: "Run failed" })}\n\n`,
    );
  });

  it("sends timeout and passes the configured wait to the service", async () => {
    const run = {
      getRunDetail: vi.fn().mockResolvedValue({ ok: true, value: {} }),
      waitForRun: vi.fn().mockResolvedValue({ status: "timeout" }),
    };
    const app = await makeApp(run, 1234);

    const { body } = await readStream(app, "run-1");

    expect(body).toContain(`event: timeout\ndata: {"runId":"run-1"}\n\n`);
    expect(run.waitForRun).toHaveBeenCalledWith("run-1", { timeoutMs: 1234 });
  });

  it("answers 404 for a run that does not exist, without waiting", async () => {
    const run = {
      getRunDetail: vi
        .fn()
        .mockResolvedValue({ ok: false, error: "Run not found: run-9" }),
      waitForRun: vi.fn(),
    };
    const app = await makeApp(run);

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/run-9/stream",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      ok: false,
      error: "Run not found: run-9",
    });
    expect(run.waitForRun).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed run id, without touching the service", async () => {
    const run = { getRunDetail: vi.fn(), waitForRun: vi.fn() };
    const app = await makeApp(run);

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/not_a_run/stream",
    });

    expect(response.statusCode).toBe(400);
    expect(run.getRunDetail).not.toHaveBeenCalled();
  });
});
