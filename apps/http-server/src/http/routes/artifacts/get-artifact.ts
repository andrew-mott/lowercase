import type { FastifyInstance } from "fastify/types/instance.js";
import { isHash } from "../../utils/is-hash.js";
import type { GetArtifactReq, GetArtifactRes } from "@lcase/types";

export const getArtifactRoute = async (app: FastifyInstance) => {
  app.get<{ Params: GetArtifactReq }>(
    "/:hash",
    async (req): Promise<GetArtifactRes> => {
      const { hash } = req.params;
      if (!isHash(hash)) return { ok: false, error: "Invalid hash" };
      const artifact = await app.services.artifact.getArtifact(hash);
      if (!artifact.ok) return { ok: false, error: artifact.error.message };
      switch (artifact.format) {
        case "json":
          return { ok: true, format: "json", value: artifact.value };
        case "text":
          return { ok: true, format: "text", value: artifact.value };
        case "markdown":
          return { ok: true, format: "markdown", value: artifact.value };
        case "bytes":
          return {
            ok: true,
            format: "bytes",
            byteLength: artifact.value.byteLength,
            contentType: artifact.contentType,
          };
      }

      return { ok: false, error: "Unsupported artifact format" };
    },
  );
};
