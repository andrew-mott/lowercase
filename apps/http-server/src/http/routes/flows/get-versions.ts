import type { FastifyInstance } from "fastify";

export const listFlowVersionsRoute = async (app: FastifyInstance) => {
  app.get<{ Params: { flowId: string } }>("/:flowId/versions", async (req) => {
    return app.services.flow.getFlowVersions(req.params.flowId);
  });
};

export const getFlowVersionRoute = async (app: FastifyInstance) => {
  app.get<{ Params: { versionId: string } }>(
    "/versions/:versionId",
    async (req) => {
      return app.services.flow.getFlowVersionDef(req.params.versionId);
    },
  );
};
