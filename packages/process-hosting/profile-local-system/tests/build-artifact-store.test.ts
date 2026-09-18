import { describe, expect, it } from "vitest";
import {
  FsArtifactStore,
  S3ArtifactStore,
} from "@lcase/adapters/artifact-store";
import { buildArtifactStore } from "../src/build-artifact-store.js";

describe("buildArtifactStore", () => {
  it("returns an FsArtifactStore for a filesystem config", () => {
    const store = buildArtifactStore({
      kind: "filesystem",
      path: "/tmp/artifacts",
    });

    expect(store).toBeInstanceOf(FsArtifactStore);
  });

  it("returns an S3ArtifactStore for an s3 config", () => {
    const store = buildArtifactStore({
      kind: "s3",
      bucket: "artifacts-bucket",
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
    });

    expect(store).toBeInstanceOf(S3ArtifactStore);
  });
});
