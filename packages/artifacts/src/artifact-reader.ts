import type {
  ArtifactReaderPort,
  ArtifactLoadError,
  AutoLoadResult,
  ArtifactStorePort,
} from "@lcase/ports";
import type { JsonValue, Result } from "@lcase/types";

// Capability-module reader: the narrower half of the writer/reader split --
// only ArtifactStorePort, never ArtifactRepositoryPort. Built fresh,
// independent of the legacy Artifacts class and symmetric in structure to
// ArtifactWriter.
export class ArtifactReader implements ArtifactReaderPort {
  private readonly decoder = new TextDecoder();

  constructor(private readonly store: ArtifactStorePort) {}

  async load(hash: string): Promise<AutoLoadResult>;
  async load(
    hash: string,
    contentType: "application/json",
  ): Promise<Result<JsonValue, ArtifactLoadError>>;
  async load(
    hash: string,
    contentType: `text/${string}`,
  ): Promise<Result<string, ArtifactLoadError>>;
  async load(
    hash: string,
    contentType: string,
  ): Promise<Result<Uint8Array, ArtifactLoadError>>;
  async load(
    hash: string,
    contentType?: string,
  ): Promise<
    AutoLoadResult | Result<JsonValue | string | Uint8Array, ArtifactLoadError>
  > {
    const stored = await this.store.getBytes(hash);
    if (!stored.ok) {
      return { ok: false, error: stored.error };
    }

    const { bytes, contentType: storedContentType } = stored.value;

    if (contentType !== undefined && contentType !== storedContentType) {
      return {
        ok: false,
        error: {
          code: "TYPE_MISMATCH",
          message: `Expected contentType "${contentType}" but stored artifact has "${storedContentType}"`,
        },
      };
    }

    try {
      const value = this.decodeContent(bytes, contentType ?? storedContentType);
      if (contentType === undefined) {
        return { ok: true, contentType: storedContentType, value };
      }
      return { ok: true, value };
    } catch (e) {
      return {
        ok: false,
        error: {
          code: "DECODING_FAILED",
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  // Mirrors ArtifactWriter's encodeContent in reverse: application/json
  // parses, text/* decodes to a string, anything else passes through as raw
  // bytes -- there's no defined auto-decoding beyond that.
  private decodeContent(
    bytes: Uint8Array,
    contentType: string,
  ): JsonValue | string | Uint8Array {
    if (contentType === "application/json") {
      return JSON.parse(this.decoder.decode(bytes)) as JsonValue;
    }
    if (contentType.startsWith("text/")) {
      return this.decoder.decode(bytes);
    }
    return bytes;
  }
}
