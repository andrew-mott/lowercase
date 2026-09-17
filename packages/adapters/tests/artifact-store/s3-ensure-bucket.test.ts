import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3ArtifactStore } from "../../src/artifact-store/s3-artifact-store.js";

// Every branch of ensureBucket against a mocked client. The shape of a real
// missing-bucket response is pinned separately, against MinIO, in
// s3-ensure-bucket.integration.test.ts.
const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

function namedError(name: string, httpStatusCode?: number): Error {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode },
  });
}

function store(): S3ArtifactStore {
  return new S3ArtifactStore(new S3Client({}), "test-bucket");
}

describe("S3ArtifactStore.ensureBucket", () => {
  it("does nothing more when the bucket exists", async () => {
    s3Mock.on(HeadBucketCommand).resolves({});

    await store().ensureBucket({ create: true });

    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
  });

  it("creates a missing bucket when creation is enabled", async () => {
    s3Mock.on(HeadBucketCommand).rejects(namedError("NotFound", 404));
    s3Mock.on(CreateBucketCommand).resolves({});

    await store().ensureBucket({ create: true });

    const calls = s3Mock.commandCalls(CreateBucketCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Bucket).toBe("test-bucket");
  });

  it("fails naming the bucket when it is missing and creation is off", async () => {
    s3Mock.on(HeadBucketCommand).rejects(namedError("NotFound", 404));

    await expect(store().ensureBucket({ create: false })).rejects.toThrow(
      /"test-bucket" does not exist/,
    );
    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
  });

  it("treats losing a concurrent create as success", async () => {
    s3Mock.on(HeadBucketCommand).rejects(namedError("NotFound", 404));
    s3Mock
      .on(CreateBucketCommand)
      .rejects(namedError("BucketAlreadyOwnedByYou", 409));

    await expect(store().ensureBucket({ create: true })).resolves.toBe(
      undefined,
    );
  });

  it("rethrows a failure other than a missing bucket without creating", async () => {
    s3Mock.on(HeadBucketCommand).rejects(namedError("Forbidden", 403));

    await expect(store().ensureBucket({ create: true })).rejects.toThrow(
      "Forbidden",
    );
    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
  });
});
