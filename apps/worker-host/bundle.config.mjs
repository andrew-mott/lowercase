// The hosts this app bundles, read by scripts/bundle.mjs.

export const hosts = [
  {
    name: "worker-host",
    entry: "dist/main.js",
    // This process hosts Worker and nothing else: Engine, Observability, the
    // limiter, the application services, and the HTTP layer all live in other
    // processes, and SQL is Postgres only.
    forbidden: [
      "@lcase/engine",
      "@lcase/observability",
      "@lcase/limiter",
      "@lcase/app-services",
      "@lcase/profile-local-system",
      "fastify",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3",
    ],
  },
];
