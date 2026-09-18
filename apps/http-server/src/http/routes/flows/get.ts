import type { FastifyInstance } from "fastify";

export const listFlowsRoute = async (app: FastifyInstance) => {
  app.get("/", async () => {
    return app.services.flow.getAllFlows();
  });
};
