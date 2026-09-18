import { describe } from "vitest";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import { S3ArtifactStore } from "../../src/artifact-store/s3-artifact-store.js";
import { runArtifactStoreContractTests } from "./artifact-store.contract.js";

// Real integration test against a live MinIO instance -- gated on
// S3_TEST_ENDPOINT since there's no way to run this without one. Run
// `docker compose up -d minio` and copy .env.test.local.example to
// .env.test.local (loaded automatically, see tests/setup-env.ts) to
// exercise this locally; CI provides the vars directly via the workflow's
// minio service. See s3-artifact-store.test.ts for the mocked-client unit
// tests that always run regardless.
const endpoint = process.env.S3_TEST_ENDPOINT;
const bucket = process.env.S3_TEST_BUCKET ?? "artifacts-test";

describe.skipIf(!endpoint)("S3ArtifactStore contract (real MinIO)", () => {
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "minioadmin",
      secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "minioadmin",
    },
  });

  runArtifactStoreContractTests("S3ArtifactStore", async () => {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (
        name !== "BucketAlreadyOwnedByYou" &&
        name !== "BucketAlreadyExists"
      ) {
        throw e;
      }
    }
    return new S3ArtifactStore(client, bucket);
  });
});
