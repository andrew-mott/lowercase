import { defineConfig } from "vitest/config";

// The counterpart to vitest.config.ts. Redis only, so there is no SQL global
// setup: nothing here needs a migrated database.
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
    setupFiles: ["./tests/setup-env.ts"],
  },
});
