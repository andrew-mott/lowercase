import type { DomainError, Result } from "@lcase/types";

// Content-type travels with the blob itself, as first-class data -- mirrors
// what an S3/MinIO-style object store gives for free via native object
// metadata (Content-Type on PutObject/HeadObject). Replaces the old
// extension-keyed, probe-on-read shape (see LegacyArtifactStorePort).
export type ArtifactStorePutResult =
  { ok: true; path: string } | { ok: false; cause: string };

export type ArtifactStoreGetSuccess = {
  bytes: Uint8Array;
  contentType: string;
};

// Distinguishes "not found" from "read failed for some other reason" --
// collapsing both into one `null` (as this port used to) meant a real store
// error (permissions, network, corrupt metadata) was indistinguishable from
// a genuine miss. Widened once this port gained its second real
// implementation (S3ArtifactStore), see
// docs/initiatives/swappable-infrastructure/arcs/cas-adapter.md.
export type ArtifactStoreGetError = DomainError<"NOT_FOUND" | "STORE_ERROR">;

export type ArtifactStorePort = {
  putBytes(
    hash: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<ArtifactStorePutResult>;
  getBytes(
    hash: string,
  ): Promise<Result<ArtifactStoreGetSuccess, ArtifactStoreGetError>>;
};
