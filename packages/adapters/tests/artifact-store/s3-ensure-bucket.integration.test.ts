import { afterEach, describe, expect, it } from "vitest";
import {
  DeleteBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3ArtifactStore } from "../../src/artifact-store/s3-artifact-store.js";

// The mocked suite decides what a missing bucket looks like; this pins that
// decision to what MinIO actually returns. Gated on S3_TEST_ENDPOINT, like the
// contract suite beside it.
const endpoint = process.env.S3_TEST_ENDPOINT;

describe.skipIf(!endpoint)("S3ArtifactStore.ensureBucket (real MinIO)", () => {
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "minioadmin",
      secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "minioadmin",
    },
  });

  // A name no other suite uses, so creating and deleting it cannot disturb a
  // bucket something else depends on.
  const bucket = `ensure-bucket-${process.pid}-${Date.now()}`;

  afterEach(async () => {
    await client.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {
      // Already absent: the case under test never created it.
    });
  });

  it("refuses a missing bucket when creation is off", async () => {
    const store = new S3ArtifactStore(client, bucket);

    await expect(store.ensureBucket({ create: false })).rejects.toThrow(
      /does not exist/,
    );
  });

  it("creates a missing bucket, then accepts it on a second call", async () => {
    const store = new S3ArtifactStore(client, bucket);

    await store.ensureBucket({ create: true });
    await expect(
      client.send(new HeadBucketCommand({ Bucket: bucket })),
    ).resolves.toBeDefined();

    await expect(store.ensureBucket({ create: true })).resolves.toBe(undefined);
  });
});
