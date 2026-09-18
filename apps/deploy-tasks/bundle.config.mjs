// The tasks this app bundles, read by scripts/bundle.mjs.

export const hosts = [
  {
    name: "provision",
    entry: "dist/provision.js",
    // Talks to Redis and nothing else. No component runs here, and neither SQL
    // nor object storage is touched, so none of them may be carried along.
    forbidden: [
      "@lcase/engine",
      "@lcase/worker",
      "@lcase/observability",
      "@lcase/limiter",
      "@lcase/app-services",
      "@lcase/profile-local-system",
      "@lcase/db-prisma",
      "@aws-sdk/client-s3",
      "fastify",
      "better-sqlite3",
    ],
  },
];
