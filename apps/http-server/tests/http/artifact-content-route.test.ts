import Fastify from "fastify";
import type { ServicesPort } from "@lcase/ports";
import { describe, expect, it, vi } from "vitest";
import { getArtifactContentRoute } from "../../src/http/routes/artifacts/get-artifact-content.js";

const hash = "a".repeat(64);

async function makeApp(getArtifactContent: ReturnType<typeof vi.fn>) {
  const app = Fastify();
  app.decorate("services", {
    artifact: { getArtifactContent },
  } as unknown as ServicesPort);
  await app.register(getArtifactContentRoute, { prefix: "/api/artifacts" });
  return app;
}

describe("artifact content route", () => {
  it("returns binary content unchanged with its stored content type", async () => {
    const bytes = new Uint8Array([0, 255, 1, 254, 128]);
    const getArtifactContent = vi
      .fn()
      .mockResolvedValue({ ok: true, contentType: "audio/wav", value: bytes });
    const app = await makeApp(getArtifactContent);

    const response = await app.inject({
      method: "GET",
      url: `/api/artifacts/${hash}/content`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("audio/wav");
    expect(response.headers["content-length"]).toBe("5");
    expect(new Uint8Array(response.rawPayload)).toEqual(bytes);
    expect(getArtifactContent).toHaveBeenCalledWith(hash);
    await app.close();
  });

  it("returns json content as the stored bytes, not a re-serialized value", async () => {
    const text = '{ "a":   1 }\n';
    const app = await makeApp(
      vi.fn().mockResolvedValue({
        ok: true,
        contentType: "application/json",
        value: new TextEncoder().encode(text),
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/artifacts/${hash}/content`,
    });

    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.body).toBe(text);
    await app.close();
  });

  it("marks the response as immutable and tags it with the hash", async () => {
    const app = await makeApp(
      vi.fn().mockResolvedValue({
        ok: true,
        contentType: "text/plain",
        value: new TextEncoder().encode("hi"),
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/artifacts/${hash}/content`,
    });

    expect(response.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.etag).toBe(`"${hash}"`);
    await app.close();
  });

  it("rejects a malformed hash with 400 and does not read the store", async () => {
    const getArtifactContent = vi.fn();
    const app = await makeApp(getArtifactContent);

    const response = await app.inject({
      method: "GET",
      url: "/api/artifacts/not-a-hash!/content",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, error: "Invalid hash" });
    expect(getArtifactContent).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 404 with the reason when the artifact does not exist", async () => {
    const app = await makeApp(
      vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "NOT_FOUND", message: "No artifact found" },
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/artifacts/${hash}/content`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, error: "No artifact found" });
    await app.close();
  });

  it("returns 500 with the reason when the store fails", async () => {
    const app = await makeApp(
      vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "STORE_ERROR", message: "disk unavailable" },
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/artifacts/${hash}/content`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ ok: false, error: "disk unavailable" });
    await app.close();
  });
});
