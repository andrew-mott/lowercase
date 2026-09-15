import type { ArtifactStorePort } from "@lcase/ports";
import {
  FsArtifactStore,
  S3ArtifactStore,
} from "@lcase/adapters/artifact-store";
import { S3Client } from "@aws-sdk/client-s3";
import type { ArtifactStoreUserConfig } from "@lcase/types";

// The one real per-instance choice this profile makes -- isolated into its
// own function so the branch is directly unit-testable without pulling in
// the rest of the profile's wiring.
export function buildArtifactStore(
  config: ArtifactStoreUserConfig,
): ArtifactStorePort {
  switch (config.kind) {
    case "filesystem":
      return new FsArtifactStore(config.path);
    case "s3": {
      const client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: config.credentials,
      });
      return new S3ArtifactStore(client, config.bucket);
    }
  }
}
