// Loaded here, not only via setupFiles: globalSetup runs in this process before
// any worker starts, so POSTGRES_HOST_PORT has to be in the environment by the
// time the config is evaluated or the Postgres template is migrated against the
// wrong server.
import "./tests/setup-env";

import { defineConfig } from "vitest/config";

// The counterpart to vitest.config.ts. The SQL global setup migrates a template
// database once per run, which the suites clone per worker -- it also probes the
// server and reports a skip rather than failing when there is none.
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
    setupFiles: ["./tests/setup-env.ts"],
    globalSetup: ["@lcase/test-support/sql-global-setup"],
  },
});
