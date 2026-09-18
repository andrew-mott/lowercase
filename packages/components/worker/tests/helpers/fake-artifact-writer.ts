import type {
  ArtifactWriterPort,
  ArtifactMetadataInput,
  SaveArtifactResult,
} from "@lcase/ports";
import type { JsonValue } from "@lcase/types";

// A genuine in-memory ArtifactWriterPort, matching this test suite's existing
// no-`as unknown as X` bar (see fake-artifact-reader.ts). Every overload funnels
// through one internal `put`, since the fake doesn't need to distinguish
// encodings the way the real ArtifactWriter does -- it just needs a stable
// hash back for whatever was saved.
export function createFakeArtifactWriterPort() {
  const store = new Map<string, { content: unknown; contentType: string }>();
  let counter = 0;

  function put(content: unknown, contentType: string): SaveArtifactResult {
    counter += 1;
    const hash = `fake-hash-${counter}`;
    store.set(hash, { content, contentType });
    return { status: "saved", hash };
  }

  function save(
    content: JsonValue,
    contentType: "application/json",
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  function save(
    content: string,
    contentType: `text/${string}`,
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  function save(
    content: Uint8Array,
    contentType: string,
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  function save(
    content: JsonValue | string | Uint8Array,
    contentType: string,
  ): Promise<SaveArtifactResult> {
    return Promise.resolve(put(content, contentType));
  }

  const writer: ArtifactWriterPort = { save };

  return { writer, store };
}
