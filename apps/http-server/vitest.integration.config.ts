import { defineConfig } from "vitest/config";

// These suites use a real database, which is what makes them integration tests
// in this repo, but they call createSqliteTestDb() directly rather than running
// against both providers. So they take the SQLite-only global setup: the default
// one also provisions a Postgres template, which nothing here would read.
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
    globalSetup: ["@lcase/test-support/sql-global-setup/sqlite"],
  },
});
