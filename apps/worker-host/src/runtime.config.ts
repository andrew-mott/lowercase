// The concrete values this host runs with. The profile is handed its
// configuration and never reads the environment itself.

import type { WorkerHostConfig } from "./profile/worker-host.config.js";

export const config = {
  worker: {
    maxConcurrentJobs: 4,
    protocolTimeoutMs: 60_000,
    maxConcurrencyPerKey: 2,
  },

  // No `url`: omitting it defers to `defaultPostgresUrl()`, which is what the
  // Prisma CLI and the test harness already resolve. Naming one here would be a
  // fourth reader of the same decision.
  sql: { kind: "postgres" },

  artifacts: {
    kind: "s3",
    // Has to exist already -- nothing in this process creates it.
    bucket: process.env.S3_BUCKET ?? "lcase-artifacts",
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    // MinIO addresses buckets by path rather than by subdomain.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
    },
  },

  messaging: {
    kind: "redis-streams",
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    // `keyPrefix` is absent on purpose: both hosts have to derive identical
    // stream keys, and taking one default agrees more durably than repeating a
    // literal in two places.
    //
    // A consumer name identifies one reader within a group, so replicas of this
    // host would each need their own.
    consumerName: "worker-host",
  },
} satisfies WorkerHostConfig;

// These are this host's own variable names, not the S3_TEST_*/REDIS_TEST_* ones
// that gate integration suites. Reading those would start the process against
// whatever a test run last configured.
