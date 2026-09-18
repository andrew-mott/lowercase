import type {
  ArtifactWriterPort,
  ArtifactMetadataInput,
  SaveArtifactResult,
  ArtifactStorePort,
  ArtifactRepositoryPort,
} from "@lcase/ports";
import type {
  ArtifactFormat,
  ArtifactWriteMetadata,
  JsonValue,
} from "@lcase/types";
import { createHash } from "node:crypto";

// Local, not imported from @lcase/flow-analysis's inferFormatFromContentType
// -- duplicated rather than adding a cross-package dependency for a 4-line
// mapping (mirrors the legacy Artifacts.inferFormat()/defaultContentType()
// precedent). Keeps the legacy `format` column populated for every write
// through this port, not just ones already going through it before this PR.
function inferFormat(contentType: string): ArtifactFormat {
  if (contentType === "application/json") return "json";
  if (contentType === "text/markdown") return "markdown";
  if (contentType.startsWith("text/")) return "text";
  return "bytes";
}

// Capability-module writer: fuses ArtifactStorePort (CAS) + ArtifactRepositoryPort
// (SQL) behind one owned write policy. Built fresh, independent of the legacy
// Artifacts class -- repository is required here, not optional, so a
// content-only write is always a distinguishable outcome, never a silent one.
export class ArtifactWriter implements ArtifactWriterPort {
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly store: ArtifactStorePort,
    private readonly repository: ArtifactRepositoryPort,
  ) {}

  async save(
    content: JsonValue,
    contentType: "application/json",
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  async save(
    content: string,
    contentType: `text/${string}`,
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  async save(
    content: Uint8Array,
    contentType: string,
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  async save(
    content: Uint8Array | string | JsonValue,
    contentType: string,
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult> {
    let bytes: Uint8Array;
    try {
      bytes = this.encodeContent(content, contentType);
    } catch (e) {
      return {
        status: "failed",
        error: {
          code: "ENCODING_FAILED",
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }

    const hash = this.hashBytes(bytes);

    const storeResult = await this.store.putBytes(hash, bytes, contentType);
    if (!storeResult.ok) {
      return {
        status: "failed",
        error: {
          code: "STORE_PUT_FAILED",
          message: "Error putting bytes in store",
          cause: storeResult.cause,
        },
      };
    }

    const { filename, ...rest } = metadata ?? {};
    const writeMetadata: ArtifactWriteMetadata =
      rest.curated === true ? rest : { ...rest, curated: false };

    const writeResult = await this.repository.writeArtifact(
      {
        hash,
        time: new Date().toISOString(),
        size: bytes.length,
        contentType,
        format: inferFormat(contentType),
        filename,
      },
      writeMetadata,
    );

    if (!writeResult.ok) {
      return {
        status: "content-only",
        hash,
        error: {
          code: "METADATA_WRITE_FAILED",
          message: "Error writing artifact metadata",
          cause: writeResult.error,
        },
      };
    }

    return { status: "saved", hash };
  }

  // Bytes-only content always passes through, regardless of contentType --
  // the escape hatch for binary and anything a caller has already encoded.
  // Otherwise contentType decides how to encode: application/json accepts
  // any JsonValue, text/* accepts a string. Anything else, non-Uint8Array,
  // is a caller error -- there's no defined auto-encoding for arbitrary
  // binary from a JS value.
  private encodeContent(
    content: Uint8Array | string | JsonValue,
    contentType: string,
  ): Uint8Array {
    if (content instanceof Uint8Array) return content;
    if (contentType === "application/json") {
      return this.encoder.encode(JSON.stringify(content));
    }
    if (contentType.startsWith("text/")) {
      if (typeof content !== "string") {
        throw new Error(
          `Content for contentType "${contentType}" must be a string or Uint8Array`,
        );
      }
      return this.encoder.encode(content);
    }
    throw new Error(
      `Cannot auto-encode content for contentType "${contentType}" -- pass a pre-encoded Uint8Array instead`,
    );
  }

  private hashBytes(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  }
}
