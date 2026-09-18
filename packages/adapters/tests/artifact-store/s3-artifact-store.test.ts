import { describe, expect, it, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "node:stream";
import { S3ArtifactStore } from "../../src/artifact-store/s3-artifact-store.js";

// Unit-level coverage for S3ArtifactStore's error mapping -- the real-MinIO
// contract test (s3-artifact-store.contract.test.ts) can't easily trigger a
// generic store error without deliberately breaking the connection, so that
// branch is verified here instead, against a mocked client. Runs
// unconditionally, no MinIO/Docker required.
const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("S3ArtifactStore", () => {
  it("maps a NoSuchKey error to a NOT_FOUND result", async () => {
    const notFound = Object.assign(
      new Error("The specified key does not exist."),
      {
        name: "NoSuchKey",
      },
    );
    s3Mock.on(GetObjectCommand).rejects(notFound);

    const store = new S3ArtifactStore(new S3Client({}), "test-bucket");
    const result = await store.getBytes("missing-hash");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("maps a generic client failure to a STORE_ERROR result with cause populated", async () => {
    const failure = new Error("connection refused");
    s3Mock.on(GetObjectCommand).rejects(failure);

    const store = new S3ArtifactStore(new S3Client({}), "test-bucket");
    const result = await store.getBytes("some-hash");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");
    expect(result.error.code).toBe("STORE_ERROR");
    expect(result.error.cause).toBe("connection refused");
  });

  it("round-trips a successful getBytes against a mocked response", async () => {
    const bytes = new TextEncoder().encode("hello");
    const body = sdkStreamMixin(Readable.from([Buffer.from(bytes)]));
    s3Mock.on(GetObjectCommand).resolves({
      Body: body,
      ContentType: "text/plain",
    });

    const store = new S3ArtifactStore(new S3Client({}), "test-bucket");
    const result = await store.getBytes("some-hash");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(new TextDecoder().decode(result.value.bytes)).toBe("hello");
    expect(result.value.contentType).toBe("text/plain");
  });

  it("returns a failed put result when the client throws", async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error("access denied"));

    const store = new S3ArtifactStore(new S3Client({}), "test-bucket");
    const result = await store.putBytes(
      "some-hash",
      new TextEncoder().encode("hello"),
      "text/plain",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");
    expect(result.cause).toBe("access denied");
  });
});
