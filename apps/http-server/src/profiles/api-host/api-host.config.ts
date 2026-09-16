// What this host's profile has to be told in order to compose itself. Each axis
// admits one backend, for the same reasons the Worker host's does: Postgres and
// S3 because the work of a run is split across two processes that have to read
// each other's writes, and Redis because an in-process carrier could only
// deliver to something inside this process, and the Worker it publishes
// commands to is not.
//
// The embedded host keeps the wide `LocalSystemConfig` with a branch per axis.
// That difference is the point rather than an inconsistency: a deployment that
// exists to be distributed has nothing to select.

import type {
  PostgresSqlUserConfig,
  RedisStreamsMessagingUserConfig,
  S3ArtifactStoreUserConfig,
} from "@lcase/types";
import type { ObservabilityConfig } from "./observability.config.js";

export type ApiHostConfig = {
  sql: PostgresSqlUserConfig;
  artifacts: S3ArtifactStoreUserConfig;
  messaging: RedisStreamsMessagingUserConfig;
  // Which optional sinks to attach. Not an infrastructure axis -- the two
  // projection sinks are attached regardless, because the read paths this host
  // serves are queries against what they write.
  observability: ObservabilityConfig;
};
