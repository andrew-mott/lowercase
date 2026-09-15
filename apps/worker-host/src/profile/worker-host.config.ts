// What this host's profile has to be told in order to compose itself. Each axis
// admits one backend, the one hosting Worker alone forces: Postgres and S3
// because a second process has to read what Worker writes, and Redis because an
// in-process carrier would seal an object graph holding Worker and nothing for
// Worker to answer.

import type {
  PostgresSqlUserConfig,
  RedisStreamsMessagingUserConfig,
  S3ArtifactStoreUserConfig,
  WorkerUserConfig,
} from "@lcase/types";

export type WorkerHostConfig = {
  worker: WorkerUserConfig;
  sql: PostgresSqlUserConfig;
  artifacts: S3ArtifactStoreUserConfig;
  messaging: RedisStreamsMessagingUserConfig;
};
