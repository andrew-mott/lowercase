import type { FastifyInstance } from "fastify";
import type { GetCuratedArtifactsRes } from "@lcase/types";

export const getCuratedArtifactsForParamRoute = async (
  app: FastifyInstance,
) => {
  app.get<{ Params: { versionId: string; paramName: string } }>(
    "/versions/:versionId/params/:paramName/curated-artifacts",
    async (req): Promise<GetCuratedArtifactsRes> => {
      const { versionId, paramName } = req.params;
      const value = await app.services.artifact.listCuratedArtifacts(
        versionId,
        paramName,
      );
      return { ok: true, value };
    },
  );
};
