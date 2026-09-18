import type { DomainError, JsonValue, Result } from "@lcase/types";

// Capability-module inbound port (see docs/component-architecture/research/
// capability-modules.md): the narrower read half of the writer/reader split
// -- needs only ArtifactStorePort, never ArtifactRepositoryPort, matching the
// real read/write asymmetry found while investigating this refactor (every
// real write wants CAS+SQL together; almost every real read only wants
// content by hash).
export interface ArtifactReaderPort {
  // Caller doesn't know/expect a type -- infers decoding from whatever
  // contentType is actually stored, returns both. This is `getAuto()`'s real
  // successor.
  load(hash: string): Promise<AutoLoadResult>;

  // Caller expects a specific type -- decodes to it, fails if the stored
  // contentType doesn't actually match what was asked for.
  load(
    hash: string,
    contentType: "application/json",
  ): Promise<Result<JsonValue, ArtifactLoadError>>;
  load(
    hash: string,
    contentType: `text/${string}`,
  ): Promise<Result<string, ArtifactLoadError>>;
  load(
    hash: string,
    contentType: string,
  ): Promise<Result<Uint8Array, ArtifactLoadError>>;
}

// contentType and value travel as siblings here, not nested inside Result's
// own `value` (which would produce `result.value.value`) -- see
// docs/initiatives/worker-tools-artifacts/arcs/artifacts-v2-build.md's
// discussion of why `value` doesn't hold up as a name once the payload needs
// to travel with a sibling field.
export type AutoLoadResult =
  | { ok: true; contentType: string; value: JsonValue | string | Uint8Array }
  | { ok: false; error: ArtifactLoadError };

export type ArtifactLoadError = DomainError<
  "NOT_FOUND" | "TYPE_MISMATCH" | "DECODING_FAILED" | "STORE_ERROR"
>;
