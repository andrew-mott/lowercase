import type {
  ArtifactReaderPort,
  ArtifactLoadError,
  AutoLoadResult,
  RawLoadResult,
} from "@lcase/ports";
import type { JsonValue, Result } from "@lcase/types";

// A genuine in-memory ArtifactReaderPort, matching this test suite's existing
// no-`as unknown as X` bar (see fake-artifact-writer.ts). `seed` lets a test
// pre-populate a known hash so a Ref pointing at it can actually resolve.
export function createFakeArtifactReaderPort() {
  const store = new Map<
    string,
    { contentType: string; value: JsonValue | string | Uint8Array }
  >();

  function seed(
    hash: string,
    contentType: string,
    value: JsonValue | string | Uint8Array,
  ): void {
    store.set(hash, { contentType, value });
  }

  function load(hash: string): Promise<AutoLoadResult>;
  function load(hash: string, options: { raw: true }): Promise<RawLoadResult>;
  function load(
    hash: string,
    contentType: "application/json",
  ): Promise<Result<JsonValue, ArtifactLoadError>>;
  function load(
    hash: string,
    contentType: `text/${string}`,
  ): Promise<Result<string, ArtifactLoadError>>;
  function load(
    hash: string,
    contentType: string,
  ): Promise<Result<Uint8Array, ArtifactLoadError>>;
  function load(
    hash: string,
    contentTypeOrOptions?: string | { raw: true },
  ): Promise<
    | AutoLoadResult
    | RawLoadResult
    | Result<JsonValue | string | Uint8Array, ArtifactLoadError>
  > {
    // The worker never reads raw, and this fake keeps decoded values, so it
    // has no stored bytes to hand back.
    if (typeof contentTypeOrOptions === "object") {
      return Promise.resolve({
        ok: false,
        error: {
          code: "STORE_ERROR",
          message: "Raw reads are not supported by this fake",
        },
      });
    }
    const contentType = contentTypeOrOptions;
    const entry = store.get(hash);
    if (!entry) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `No artifact found for hash "${hash}"`,
        },
      });
    }
    if (contentType !== undefined && contentType !== entry.contentType) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "TYPE_MISMATCH",
          message: `Expected contentType "${contentType}" but stored artifact has "${entry.contentType}"`,
        },
      });
    }
    if (contentType === undefined) {
      return Promise.resolve({
        ok: true,
        contentType: entry.contentType,
        value: entry.value,
      });
    }
    return Promise.resolve({ ok: true, value: entry.value });
  }

  const reader: ArtifactReaderPort = { load };

  return { reader, store, seed };
}
