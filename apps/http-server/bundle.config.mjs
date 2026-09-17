// The hosts this app bundles, read by scripts/bundle.mjs.

export const hosts = [
  {
    name: "api",
    entry: "dist/hosts/api.js",
    // Nothing stops this entry point from importing what the embedded host
    // does, so the boundary is asserted against what actually got bundled:
    // Worker runs in its own process, nothing produces limiter requests, and
    // SQL is Postgres only.
    forbidden: [
      "@lcase/worker",
      "@lcase/limiter",
      "@lcase/profile-local-system",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3",
    ],
  },
  {
    name: "embedded",
    entry: "dist/hosts/embedded.js",
    // better-sqlite3's loader uses __filename to locate its native binding,
    // which an ESM bundle does not have, so it is installed beside the artifact
    // instead.
    external: ["better-sqlite3"],
  },
];
