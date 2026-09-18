import type {
  ArtifactStorePort,
  ArtifactStoreGetSuccess,
  ArtifactStorePutResult,
  ArtifactStoreGetError,
} from "@lcase/ports";
import type { Result } from "@lcase/types";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

// Built against the standard S3 API, not MinIO-specific -- MinIO differs
// only in how the injected S3Client is configured (endpoint, path-style
// addressing, credentials), never in the calls made here. Object keys are
// flat (the hash itself), not sharded by prefix like FsArtifactStore --
// S3/MinIO don't have the directory-fanout problem sharding exists to solve
// on a filesystem. Content-type rides as native object metadata, so there's
// no sidecar file to manage the way FsArtifactStore needs one. putBytes does
// a blind overwrite with no pre-check: same hash always means same bytes, so
// overwriting is always a correctness no-op, and a HeadObject round-trip
// isn't worth paying on every write given today's artifacts are small
// JSON/text (see docs/initiatives/swappable-infrastructure/arcs/cas-adapter.md).
export class S3ArtifactStore implements ArtifactStorePort {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async putBytes(
    hash: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<ArtifactStorePutResult> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: hash,
          Body: bytes,
          ContentType: contentType,
        }),
      );
      return { ok: true, path: hash };
    } catch (e) {
      return {
        ok: false,
        cause: e instanceof Error ? e.message : "Error putting bytes",
      };
    }
  }

  async getBytes(
    hash: string,
  ): Promise<Result<ArtifactStoreGetSuccess, ArtifactStoreGetError>> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: hash }),
      );
      const bytes =
        (await res.Body?.transformToByteArray()) ?? new Uint8Array();
      return {
        ok: true,
        value: {
          bytes,
          contentType: res.ContentType ?? "application/octet-stream",
        },
      };
    } catch (e) {
      if (this.isNoSuchKey(e)) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `No artifact found for hash "${hash}"`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: "STORE_ERROR",
          message: e instanceof Error ? e.message : "Error getting bytes",
          cause: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  /**
   * Confirms the bucket exists, creating it first when `create` is set.
   *
   * Deliberately not on `ArtifactStorePort`: provisioning belongs to a host's
   * start hook, the way `RedisMessageLog.ensureStream` provisions streams, and
   * nothing that reads or writes artifacts should be able to reach it.
   *
   * Two hosts starting together can both find the bucket missing, so losing the
   * race to create it counts as success. Anything other than a missing bucket --
   * bad credentials, an unreachable endpoint -- is rethrown without attempting a
   * create, since creating cannot fix it.
   */
  async ensureBucket(options: { create: boolean }): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (e) {
      if (!this.isMissingBucket(e)) throw e;
    }

    if (!options.create) {
      throw new Error(
        `S3 bucket "${this.bucket}" does not exist, and creating it is not enabled`,
      );
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (
        name !== "BucketAlreadyOwnedByYou" &&
        name !== "BucketAlreadyExists"
      ) {
        throw e;
      }
    }
  }

  // HeadBucket has no response body, so a missing bucket arrives as a bare 404
  // named NotFound rather than as the NoSuchBucket code other calls use.
  private isMissingBucket(e: unknown): boolean {
    if (!(e instanceof Error)) return false;
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    return e.name === "NotFound" || e.name === "NoSuchBucket" || status === 404;
  }

  private isNoSuchKey(e: unknown): boolean {
    return e instanceof Error && "name" in e && e.name === "NoSuchKey";
  }
}
