import type { MultipartFile } from "@fastify/multipart";
import type {
  ArtifactFormat,
  ArtifactPutInput,
  ArtifactUpdateMetadata,
  JsonValue,
  PostArtifactReq,
  PostArtifactRes,
} from "@lcase/types";
import type { FastifyInstance } from "fastify/types/instance.js";

const jsonMimeSet = new Set([
  "application/json",
  "text/json",
  "application/octet-stream",
]);

const textMimeSet = new Set(["text/plain"]);
const markdownMimeSet = new Set(["text/markdown", "text/x-markdown"]);

type BufferedUpload = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

export const postArtifactRoute = async (app: FastifyInstance) => {
  app.post("/", async (req, reply): Promise<PostArtifactRes> => {
    if (req.isMultipart()) {
      let fileCount = 0;
      let upload: BufferedUpload | undefined;
      let metadataRaw: string | undefined;

      for await (const part of req.parts()) {
        if (part.type === "field") {
          if (part.fieldname === "metadata" && typeof part.value === "string") {
            metadataRaw = part.value;
          }
          continue;
        }

        fileCount += 1;
        if (fileCount > 1) {
          return reply
            .code(400)
            .send({ ok: false, error: "Only one file upload is supported" });
        }

        upload = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        };
      }

      if (!upload) {
        return reply
          .code(400)
          .send({ ok: false, error: "Missing upload file" });
      }

      let metadata: ArtifactUpdateMetadata | undefined;
      if (metadataRaw) {
        try {
          metadata = JSON.parse(metadataRaw) as ArtifactUpdateMetadata;
        } catch {
          return reply
            .code(400)
            .send({ ok: false, error: "Invalid metadata JSON" });
        }
      }

      const putInput = makeArtifactPutInputFromBuffer(upload);
      if (!putInput.ok) return reply.code(400).send(putInput);

      const result = await app.services.artifact.createArtifact(
        putInput.value,
        metadata,
      );
      if (!result.ok) return reply.code(500).send(result);
      return result;
    }

    const body = req.body as PostArtifactReq;
    const format = detectAuthoredFormat(body.contentType);
    if (!format) {
      return reply.code(400).send({
        ok: false,
        error: `Unsupported content type: ${body.contentType}`,
      });
    }

    let putInput: ArtifactPutInput;
    if (format === "json") {
      let value: JsonValue;
      try {
        value = JSON.parse(body.value) as JsonValue;
      } catch {
        return reply
          .code(400)
          .send({ ok: false, error: "Invalid JSON content" });
      }
      putInput = {
        format: "json",
        value,
        index: { contentType: body.contentType },
      };
    } else {
      putInput = {
        format,
        value: body.value,
        index: { contentType: body.contentType },
      };
    }

    const result = await app.services.artifact.createArtifact(
      putInput,
      body.metadata,
    );
    if (!result.ok) return reply.code(500).send(result);
    return result;
  });
};

// authored (JSON body) content has no filename to disambiguate with, so
// unlike the multipart branch below there's no octet-stream-as-json
// fallback and no `bytes` fallback -- raw bytes have no sensible JSON-body
// `value` representation, so an unmapped contentType here is a real 400
function detectAuthoredFormat(
  contentType: string,
): "json" | "text" | "markdown" | undefined {
  if (contentType === "application/json" || contentType === "text/json") {
    return "json";
  }
  if (textMimeSet.has(contentType)) return "text";
  if (markdownMimeSet.has(contentType)) return "markdown";
}

// multipart uploads use filename+mimetype together (matching the prior
// dedicated file-upload route's whitelist), but fall through to "bytes"
// instead of rejecting when nothing matches -- closes a real prior gap
// where arbitrary binary uploads (e.g. images) were rejected outright
function detectUploadFormat(
  part: Pick<MultipartFile, "filename" | "mimetype">,
): ArtifactFormat {
  const filename = part.filename?.toLowerCase();
  if (filename?.endsWith(".json") && jsonMimeSet.has(part.mimetype)) {
    return "json";
  }
  if (filename?.endsWith(".txt") && textMimeSet.has(part.mimetype)) {
    return "text";
  }
  if (filename?.endsWith(".md") && markdownMimeSet.has(part.mimetype)) {
    return "markdown";
  }
  return "bytes";
}

export function makeArtifactPutInputFromBuffer(
  upload: BufferedUpload,
): { ok: true; value: ArtifactPutInput } | { ok: false; error: string } {
  const format = detectUploadFormat(upload);
  const index = { filename: upload.filename, contentType: upload.mimetype };

  switch (format) {
    case "json": {
      try {
        const value = JSON.parse(upload.buffer.toString("utf8")) as JsonValue;
        return { ok: true, value: { format: "json", value, index } };
      } catch {
        return { ok: false, error: "Invalid JSON file contents" };
      }
    }
    case "text":
      return {
        ok: true,
        value: { format: "text", value: upload.buffer.toString("utf8"), index },
      };
    case "markdown":
      return {
        ok: true,
        value: {
          format: "markdown",
          value: upload.buffer.toString("utf8"),
          index,
        },
      };
    case "bytes":
      return {
        ok: true,
        value: { format: "bytes", value: upload.buffer, index },
      };
  }
}
