import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { createLocalSystem } from "../src/local-system.profile.js";
import type { LocalSystemConfig } from "../src/config/local-system.config.js";

const config: LocalSystemConfig = {
  worker: {
    maxConcurrentJobs: 4,
    protocolTimeoutMs: 60_000,
    maxConcurrencyPerKey: 2,
  },
  observability: {},
  limiter: { id: "test-limiter", scope: "test-global" },
  artifacts: { kind: "filesystem", path: "/tmp/lcase-test-artifacts" },
  sql: { kind: "sqlite" },
  messaging: { kind: "in-process" },
};

describe("createLocalSystem", () => {
  // JsonlEventLog's constructor eagerly mkdirs its directory (non-recursive
  // -- see packages/adapters/src/event-store/jsonl.store.ts), so the parent
  // "lcase-db" dir needs to already exist relative to cwd before
  // createLocalSystem() runs, same as it implicitly does in a real app run.
  beforeAll(() => {
    fs.mkdirSync(path.resolve(process.cwd(), "lcase-db"), { recursive: true });
  });

  it("constructs without throwing and returns every expected piece", () => {
    const system = createLocalSystem(config);

    expect(system.services.flow).toBeDefined();
    expect(system.services.replay).toBeDefined();
    expect(system.services.sim).toBeDefined();
    expect(system.services.run).toBeDefined();
    expect(system.services.artifact).toBeDefined();
    expect(system.services.eval).toBeDefined();
    expect(Object.keys(system.services).sort()).toEqual(
      ["artifact", "eval", "flow", "replay", "run", "sim"].sort(),
    );

    expect(system.runtime.start).toBeInstanceOf(Function);
    expect(system.runtime.stop).toBeInstanceOf(Function);
    expect(system.runtime.health).toBeInstanceOf(Function);

    expect(system.tap.attachSink).toBeInstanceOf(Function);
    expect(system.tap.detachSink).toBeInstanceOf(Function);
  });
});
