// Loaded here, not only via setupFiles: globalSetup runs in this process before
// any worker starts, so POSTGRES_TEST_URL has to be in the environment by the
// time the config is evaluated or the Postgres template never gets migrated.
import "./tests/setup-env";

import { defineConfig } from "vitest/config";

// The counterpart to vitest.config.ts: this selects only the integration
// suites, which that config excludes. globalSetup migrates the SQLite template
// file and the Postgres template database once per run, so no suite pays for a
// migration itself.
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
    setupFiles: ["./tests/setup-env.ts"],
    globalSetup: ["@lcase/test-support/sql-global-setup"],
  },
});
