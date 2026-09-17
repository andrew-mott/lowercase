import { defineConfig, env } from "prisma/config";

// The Postgres config the migrate image runs, and nothing else.
//
// prisma.postgres.config.ts cannot be used inside an image: it imports this
// package's TypeScript to derive a URL from the repository's .env, and an image
// has neither. This one reads POSTGRES_DATABASE_URL, the variable every host
// already names, and fails loudly when it is unset.

export default defineConfig({
  schema: "prisma/postgres/schema.prisma",
  migrations: {
    path: "prisma/postgres/migrations",
  },
  datasource: {
    url: env("POSTGRES_DATABASE_URL"),
  },
});
