import type { FastifyInstance } from "fastify/types/instance.js";
import type { GetArtifactsReq, GetArtifactsRes } from "@lcase/types";

export const listArtifactsRoute = async (app: FastifyInstance) => {
  app.get<{ Querystring: GetArtifactsReq }>(
    "/",
    async (req): Promise<GetArtifactsRes> => {
      try {
        const { flowId, flowVersionId, curated, hash } = req.query;
        const artifacts = await app.services.artifact.listArtifacts({
          flowId,
          flowVersionId,
          curated:
            curated === "true" ? true : curated === "false" ? false : undefined,
          hash,
        });
        return { ok: true, value: artifacts };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Error listing artifacts",
        };
      }
    },
  );
};
