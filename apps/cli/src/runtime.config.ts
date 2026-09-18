import type { LocalSystemConfig } from "@lcase/profile-local-system";
import path from "node:path";

export const config = {
  worker: {
    maxConcurrentJobs: 4,
    protocolTimeoutMs: 60_000,
    maxConcurrencyPerKey: 2,
  },
  observability: {
    sinks: ["console-log-sink", "replay-jsonl-sink"],
  },
  limiter: {
    id: "cli-limiter",
    scope: "cli-global",
  },
  artifacts: {
    kind: "filesystem",
    path: path.resolve(process.cwd(), "lcase-db/runs/artifacts"),
  },
  sql: { kind: "sqlite" },
  messaging: { kind: "in-process" },
} satisfies LocalSystemConfig;
