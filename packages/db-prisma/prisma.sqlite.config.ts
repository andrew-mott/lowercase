import { defineConfig } from "prisma/config";
import { defaultSqliteUrl } from "./src/sqlite-url.js";

// There is deliberately no default-named prisma.config.ts in this package. A
// bare `prisma migrate` picking a provider implicitly is a footgun once two of
// them exist, so every command names the config it means.

export default defineConfig({
  schema: "prisma/sqlite/schema.prisma",
  migrations: {
    path: "prisma/sqlite/migrations",
  },
  datasource: {
    // The same function the runtime calls, imported rather than reimplemented:
    // the CLI and a running app have to name the same file, and a relative
    // `file:` URL in .env otherwise means the schema directory here and the
    // working directory there.
    url: defaultSqliteUrl(),
  },
});
