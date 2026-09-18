import { defineConfig } from "vitest/config";

// No setupFiles and no integration config: every suite here is a unit test.
// The Redis router is exercised against an in-memory MessageLogPort fake, and
// the real-Redis vertical slice belongs to the profile that declares a topology.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.[jt]s"],
    exclude: ["node_modules", "dist", ".turbo"],
  },
});
