import type { FastifyInstance } from "fastify";
import type { SystemHealthReport } from "@lcase/assembly";

export type HealthRouteOptions = {
  health: () => Promise<SystemHealthReport>;
};

/**
 * The process's own readiness, for a container healthcheck or a load balancer.
 *
 * Answers with the runtime's per-resource report, and its status code is the
 * part a caller acts on: 200 when every resource reports healthy, 503 when any
 * does not. A resource with no health hook reports healthy, so this is only as
 * precise as the hooks behind it.
 *
 * Handed a function rather than the runtime, so the HTTP layer can read health
 * without being able to start or stop anything.
 */
export const healthRoute = async (
  app: FastifyInstance,
  { health }: HealthRouteOptions,
) => {
  app.get("/health", async (_request, reply) => {
    const report = await health();
    return reply.code(report.status === "healthy" ? 200 : 503).send(report);
  });
};
