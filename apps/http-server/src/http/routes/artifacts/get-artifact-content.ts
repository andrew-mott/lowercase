import type { FastifyInstance } from "fastify";
import { isHash } from "../../utils/is-hash.js";

// The body is the stored bytes, so success carries no `ok` envelope and a
// client tells the two apart by status; failures still return JSON so the
// reason travels with the status.
export const getArtifactContentRoute = async (app: FastifyInstance) => {
  app.get<{ Params: { hash: unknown } }>(
    "/:hash/content",
    async (req, reply) => {
      const { hash } = req.params;
      if (!isHash(hash)) {
        return reply.code(400).send({ ok: false, error: "Invalid hash" });
      }

      const artifact = await app.services.artifact.getArtifactContent(hash);
      if (!artifact.ok) {
        const status = artifact.error.code === "NOT_FOUND" ? 404 : 500;
        return reply
          .code(status)
          .send({ ok: false, error: artifact.error.message });
      }

      // A hash names its content forever, so caches never need to revalidate.
      return reply
        .header("Content-Type", artifact.contentType)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("ETag", `"${hash}"`)
        .send(Buffer.from(artifact.value));
    },
  );
};
