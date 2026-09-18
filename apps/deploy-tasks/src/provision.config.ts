// The concrete values the provision task runs with. The task is handed its
// configuration and never reads the environment itself.

import type { ProvisionConfig } from "./tasks/provision.js";

export const config = {
  messaging: {
    // The same variable and default both hosts read, so one setting points all
    // three at the same Redis.
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    // `keyPrefix` is absent for the same reason it is absent in both hosts:
    // everything taking the one default derives identical stream keys.
  },
} satisfies ProvisionConfig;
