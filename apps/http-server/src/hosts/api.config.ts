// The concrete values the API host runs with. The profile is handed its
// configuration and never reads the environment itself.

import type { ApiHostConfig } from "../profiles/api-host/api-host.config.js";

export const config = {
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
    consumerName: "api-host",
  },

  // Matching the embedded host's set. The console sink is what makes the
  // partial proof readable -- a command published and nothing following it --
  // and the replay sink writes this process's own view of the run.
  observability: {
    sinks: ["console-log-sink", "replay-jsonl-sink"],
  },
} satisfies ApiHostConfig;

// These are this host's own variable names, not the S3_TEST_*/REDIS_TEST_* ones
// that gate integration suites. Reading those would start the process against
// whatever a test run last configured.
