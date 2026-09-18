import { defineConfig } from "vitest/config";

// No setupFiles: nothing in this package reads the environment, and it has no
// integration suite, so there is no second config either.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
  },
});
