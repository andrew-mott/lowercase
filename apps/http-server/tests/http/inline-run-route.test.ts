import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { ServicesPort } from "@lcase/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestRunsRoute } from "../../src/http/routes/runs/request.js";

const run = { flowId: "f", flowVersionId: "v", flowDefHash: "a".repeat(64) };
const outputs = {
  speech: { ok: true, hash: "b".repeat(64), contentType: "audio/wav" },
};

const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeServer(overrides?: {
  requestRun?: ReturnType<typeof vi.fn>;
}) {
  const requestRun =
    overrides?.requestRun ?? vi.fn().mockResolvedValue(undefined);
  const storeInputArtifact = vi.fn().mockImplementation(async (input) => ({
    ok: true,
    value: { hash: `hash-of-${input.index.contentType}` },
  }));
  const waitForRun = vi
    .fn()
    .mockResolvedValue({ status: "completed", outputs });
  const app = Fastify();
  apps.push(app);
  app.decorate("services", {
    run: { requestRun, makeRunId: () => "run-1", waitForRun },
    artifact: { storeInputArtifact },
  } as unknown as ServicesPort);
  await app.register(multipart);
  await app.register(requestRunsRoute, { prefix: "/api/runs" });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return { url: `${address}/api/runs`, requestRun, storeInputArtifact };
}

const post = (url: string, form: FormData) =>
  fetch(url, { method: "POST", body: form });

describe("inline run request", () => {
  it("stores each input, starts the run and streams its outputs", async () => {
    const { url, requestRun, storeInputArtifact } = await makeServer();
    const audio = new Uint8Array([0, 255, 128, 7]);
    const form = new FormData();
    form.append("run", JSON.stringify(run));
    form.append(
      "audio",
      new Blob([audio], { type: "audio/webm" }),
      "clip.webm",
    );
    form.append(
      "options",
      new Blob(['{"language":"en"}'], { type: "application/json" }),
    );

    const response = await post(url, form);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(body).toBe(
      `event: accepted\ndata: {"runId":"run-1"}\n\n` +
        `event: completed\ndata: ${JSON.stringify({ ok: true, outputs })}\n\n`,
    );
    expect(requestRun).toHaveBeenCalledWith({
      ...run,
      source: "lowercase://http-server",
      runId: "run-1",
      params: {
        audio: "hash-of-audio/webm",
        options: "hash-of-application/json",
      },
    });
    const stored = storeInputArtifact.mock.calls[0]?.[0];
    expect(stored.format).toBe("bytes");
    expect(Buffer.from(stored.value)).toEqual(Buffer.from(audio));
  });

  it("answers 400 without a stream when the run part is missing", async () => {
    const { url, requestRun } = await makeServer();
    const form = new FormData();
    form.append(
      "audio",
      new Blob([new Uint8Array([1])], { type: "audio/webm" }),
    );

    const response = await post(url, form);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Missing "run" part',
    });
    expect(requestRun).not.toHaveBeenCalled();
  });

  it("answers 400 with the run service's message when a param does not fit", async () => {
    const requestRun = vi
      .fn()
      .mockRejectedValue(new Error("Artifact incompatible with param: audio"));
    const { url } = await makeServer({ requestRun });
    const form = new FormData();
    form.append("run", JSON.stringify(run));
    form.append("audio", new Blob(["text"], { type: "text/plain" }));

    const response = await post(url, form);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Artifact incompatible with param: audio",
    });
  });
});
