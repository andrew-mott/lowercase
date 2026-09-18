import { defineConfig } from "vitest/config";

// Integration suites are excluded here and selected by
// vitest.integration.config.ts instead, so every file belongs to exactly one
// task rather than running under both.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.[jt]s"],
    exclude: [
      "node_modules",
      "dist",
      ".turbo",
      "tests/**/*.integration.test.[jt]s",
    ],
    setupFiles: ["./tests/setup-env.ts"],
  },
});
