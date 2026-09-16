import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

/**
 * Route meant for uploading json files an adding them to the store.
 * Processing multipart/form-data header type with plugin.
 * @url api/flows/files
 * @method POST
 * @param app FastifyInstance
 */
export const postFlowsFilesRoute = async (app: FastifyInstance) => {
  app.post("/", async (req, reply) => {
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const isJsonFile = isJsonLikeFile(part);
        if (!isJsonFile) {
          return reply
            .code(400)
            .send({ ok: false, error: "Invalid headers or file extension" });
        }

        const buffer = await part.toBuffer();
        const text = buffer.toString("utf8");
        const result = await app.services.flow.addFlow(text);

        if (!result.ok) return reply.code(400).send(result);
        return result;
      }
    }
  });
};

const jsonMimeSet = new Set([
  "application/json",
  "test/json",
  "application/octet-stream",
]);

/**
 * Helper function to check if the declares MIME type is similar to json,
 * and that the filename ends in .json
 *
 * could move this to a utils if needed
 * @param part MultipartFile
 * @returns boolean
 */
export function isJsonLikeFile(part: MultipartFile): boolean {
  if (!jsonMimeSet.has(part.mimetype)) return false;
  if (!part.filename?.toLowerCase().endsWith(".json")) return false;
  return true;
}
