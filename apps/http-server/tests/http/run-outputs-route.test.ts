import Fastify from "fastify";
import type { ServicesPort } from "@lcase/ports";
import { describe, expect, it, vi } from "vitest";
import { getRunOutputsRoute } from "../../src/http/routes/runs/get-run-outputs.js";

async function makeApp(getRunOutputs: ReturnType<typeof vi.fn>) {
  const app = Fastify();
  app.decorate("services", {
    run: { getRunOutputs },
  } as unknown as ServicesPort);
  await app.register(getRunOutputsRoute, { prefix: "/api/runs" });
  return app;
}

describe("run outputs route", () => {
  it("returns a run's outputs under an outputs key", async () => {
    const outputs = {
      speech: { ok: true, hash: "a".repeat(64), contentType: "audio/wav" },
      skipped: { ok: false, error: "not-produced" },
    };
    const getRunOutputs = vi
      .fn()
      .mockResolvedValue({ ok: true, value: outputs });
    const app = await makeApp(getRunOutputs);

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/run-1/outputs",
    });

    expect(response.json()).toEqual({ ok: true, outputs });
    expect(getRunOutputs).toHaveBeenCalledWith("run-1");
    await app.close();
  });

  it("returns the service's error", async () => {
    const getRunOutputs = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Run has not finished" });
    const app = await makeApp(getRunOutputs);

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/run-1/outputs",
    });

    expect(response.json()).toEqual({
      ok: false,
      error: "Run has not finished",
    });
    await app.close();
  });
});
