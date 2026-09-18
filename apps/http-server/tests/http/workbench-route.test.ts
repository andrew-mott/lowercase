import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { workbenchRoute } from "../../src/http/routes/workbench.js";

const INDEX = "<!doctype html><title>workbench</title>";
const ASSET = "console.log('chunk');";

let root: string;
const opened: (() => Promise<void>)[] = [];

beforeAll(async () => {
  // A stand-in for a `vite build`: the entry point and one hashed chunk, which
  // is all this route distinguishes between.
  root = await fs.mkdtemp(path.join(os.tmpdir(), "lcase-workbench-"));
  await fs.writeFile(path.join(root, "index.html"), INDEX);
  await fs.mkdir(path.join(root, "assets"));
  await fs.writeFile(path.join(root, "assets", "index-abc123.js"), ASSET);
});

afterEach(async () => {
  for (const close of opened.splice(0)) await close();
});

async function serve() {
  const app = Fastify();
  // Stands in for the API: something this server owns under /api, which the
  // fallback must not answer with a page.
  app.get("/api/runs", async () => ({ ok: true }));
  await app.register(workbenchRoute, { root });
  opened.push(() => app.close());
  return app;
}

describe("workbench route", () => {
  it("serves the built entry point at the root", async () => {
    const app = await serve();

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(INDEX);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("serves a hashed asset by its own path", async () => {
    const app = await serve();

    const response = await app.inject({
      method: "GET",
      url: "/assets/index-abc123.js",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(ASSET);
  });

  // The client router owns these paths, and the server has no route for them.
  it("answers a client route with the entry point", async () => {
    const app = await serve();

    // `/evaluations` shares its first letters with `/events` and is still the
    // client's.
    for (const url of ["/workbench", "/evals", "/system", "/evaluations"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(INDEX);
    }
  });

  it("leaves the API's own routes alone", async () => {
    const app = await serve();

    const response = await app.inject({ method: "GET", url: "/api/runs" });

    expect(response.json()).toEqual({ ok: true });
  });

  // A caller of the API gets an error it can read rather than a page that looks
  // like a successful response.
  it("keeps an unknown API path a 404", async () => {
    const app = await serve();

    for (const url of ["/api/absent", "/events/absent", "/health/absent"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: "Not Found" });
    }
  });

  it("keeps an unknown path a 404 for anything that is not a GET", async () => {
    const app = await serve();

    const response = await app.inject({ method: "POST", url: "/workbench" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Not Found" });
  });

  it("refuses a root with no build in it", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "lcase-empty-"));
    const app = Fastify();
    opened.push(() => app.close());

    await expect(app.register(workbenchRoute, { root: empty })).rejects.toThrow(
      /no index.html/,
    );
  });
});
