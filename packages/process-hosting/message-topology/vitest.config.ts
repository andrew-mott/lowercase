import { defineConfig } from "vitest/config";

// No setupFiles and no integration config: everything here is static data and
// pure functions over it, so there is nothing to connect to or provision.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
  },
});
