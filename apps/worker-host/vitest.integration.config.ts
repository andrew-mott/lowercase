import { defineConfig } from "vitest/config";

// The counterpart to vitest.config.ts. No SQL globalSetup yet: this host's
// suites will need Redis, Postgres and S3 together, but a migration step that
// no suite reads would only slow the run. Add
// `@lcase/test-support/sql-global-setup` here when the first suite actually
// provisions a database.
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
    setupFiles: ["./tests/setup-env.ts"],
  },
});
