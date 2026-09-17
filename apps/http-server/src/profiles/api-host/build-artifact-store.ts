import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { S3ArtifactStore } from "@lcase/adapters/artifact-store";
import type { LifecycleHooks } from "@lcase/assembly";
import type { ArtifactStorePort } from "@lcase/ports";
import type { S3ArtifactStoreUserConfig } from "@lcase/types";

export type BuiltArtifactStore = {
  store: ArtifactStorePort;
  hooks: LifecycleHooks<ArtifactStorePort>;
};

export function buildArtifactStore(
  config: S3ArtifactStoreUserConfig,
): BuiltArtifactStore {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials,
  } satisfies S3ClientConfig);
  const store = new S3ArtifactStore(client, config.bucket);

  return {
    store,
    hooks: {
      // The counterpart to the SQL client's `SELECT 1`, and for the same
      // reason: constructing an S3Client reaches nothing, so without this the
      // process reports a healthy start having never spoken to object storage
      // and an absent bucket surfaces inside whichever job runs first. A host
      // whose entire work is reading and writing artifacts is the worst place
      // to find that out.
      //
      // Left to throw. `startAll` catches it, names this resource, and rolls
      // back everything already started.
      //
      // Called on the concrete store rather than through the port, which has no
      // operational methods: hooks normalize lifecycle so that no port has to
      // carry it, the position `MessageRouter` states.
      start: async () => {
        await store.ensureBucket({
          create: config.createBucketIfMissing ?? false,
        });
      },
      // No stop, and no health. Both are reachable from here -- the client has
      // `destroy()`, and a bucket check would answer health -- so their absence
      // is a choice not to claim more than the process needs yet.
    },
  };
}
