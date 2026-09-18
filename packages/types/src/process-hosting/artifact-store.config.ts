export type FilesystemArtifactStoreUserConfig = {
  kind: "filesystem";
  path: string;
};

// Fields cover what's needed to construct an S3Client -- S3ArtifactStore
// takes an already-built client + bucket, deliberately not config it
// builds internally (see docs/initiatives/swappable-infrastructure/arcs/
// cas-adapter.md's the related change discussion).
export type S3ArtifactStoreUserConfig = {
  kind: "s3";
  bucket: string;
  // Whether a host creates the bucket on start when it is missing. Off unless
  // set, because hosted S3 commonly grants an application no permission to
  // create buckets, and a bucket that already exists is never created.
  createBucketIfMissing?: boolean;
  endpoint?: string;
  region?: string;
  forcePathStyle?: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type ArtifactStoreUserConfig =
  FilesystemArtifactStoreUserConfig | S3ArtifactStoreUserConfig;
