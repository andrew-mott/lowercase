import Fastify from "fastify";
import type { SystemHealthReport } from "@lcase/assembly";
import { describe, expect, it } from "vitest";
import { healthRoute } from "../../src/http/routes/health.js";

async function serve(report: SystemHealthReport) {
  const app = Fastify();
  await app.register(healthRoute, { health: async () => report });
  return app;
}

describe("health route", () => {
  it("answers 200 with the report when every resource is healthy", async () => {
    const report: SystemHealthReport = {
      status: "healthy",
      resources: [{ id: "sql", health: { status: "healthy" } }],
    };
    const app = await serve(report);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(report);
    await app.close();
  });

  it("answers 503 naming the unhealthy resource", async () => {
    const report: SystemHealthReport = {
      status: "unhealthy",
      resources: [
        {
          id: "sql",
          health: { status: "unhealthy", reason: "connection refused" },
        },
        { id: "router", health: { status: "healthy" } },
      ],
    };
    const app = await serve(report);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual(report);
    await app.close();
  });
});
