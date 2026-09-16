import type { FlowDefinition } from "@lcase/types";
import type { FastifyInstance } from "fastify";

export const postFlowsRoute = async (app: FastifyInstance) => {
  app.post<{ Body: FlowDefinition }>("/", async (req) => {
    return app.services.flow.addFlow(req.body);
  });
};
