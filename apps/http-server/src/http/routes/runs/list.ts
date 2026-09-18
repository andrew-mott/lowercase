import type { FastifyInstance } from "fastify";
import type { GetRunsReq, GetRunsRes } from "@lcase/types";

export const listRunsRoute = async (app: FastifyInstance) => {
  app.get<{ Querystring: GetRunsReq }>(
    "/",
    async (req): Promise<GetRunsRes> => {
      const { flowVersionId } = req.query;
      const runList = flowVersionId
        ? await app.services.run.listRunsByFlowVersionId(flowVersionId)
        : await app.services.run.listAllRuns();
      return { ok: true, runList };
    },
  );
};
