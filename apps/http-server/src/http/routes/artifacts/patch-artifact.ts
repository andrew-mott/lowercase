import type { FastifyInstance } from "fastify/types/instance.js";
import { isHash } from "../../utils/is-hash.js";
import type { PatchArtifactReq, PatchArtifactRes } from "@lcase/types";

export const patchArtifactRoute = async (app: FastifyInstance) => {
  app.patch<{ Params: { hash: string }; Body: PatchArtifactReq }>(
    "/:hash",
    async (req): Promise<PatchArtifactRes> => {
      const { hash } = req.params;
      if (!isHash(hash)) return { ok: false, error: "Invalid hash" };
      return app.services.artifact.updateArtifactMetadata(hash, req.body);
    },
  );
};
