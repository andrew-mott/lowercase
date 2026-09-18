import { defineConfig } from "prisma/config";
import {
  defaultPostgresShadowUrl,
  defaultPostgresUrl,
} from "./src/postgres-url.js";

// prisma/postgres/schema.prisma is derived from the SQLite schema by
// scripts/build-schemas.mjs and is not checked in, so `pnpm run schema` has to
// have run before any command using this config. The package scripts chain it.

export default defineConfig({
  schema: "prisma/postgres/schema.prisma",
  migrations: {
    path: "prisma/postgres/migrations",
  },
  datasource: {
    // The same functions the runtime calls, imported rather than reimplemented,
    // so the port knob moves the CLI and a running app together.
    url: defaultPostgresUrl(),
    shadowDatabaseUrl: defaultPostgresShadowUrl(),
  },
});
