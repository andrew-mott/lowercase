import { defineConfig } from "vitest/config";

// The counterpart to vitest.config.ts. No SQL globalSetup here: this package's
// only integration suite talks to Redis, and adding a database migration it
// does not use would slow the run for nothing.
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
    setupFiles: ["./tests/setup-env.ts"],
  },
});
