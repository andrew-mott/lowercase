import { describe, expect, it } from "vitest";
import { createWorkerHost } from "../src/profile/worker-host.profile.js";
import type { WorkerHostConfig } from "../src/profile/worker-host.config.js";

// Every address is deliberately dead. Composition must not reach any of them,
// so a config that could only fail is the strongest form of that assertion.
const config: WorkerHostConfig = {
  worker: {
    maxConcurrentJobs: 4,
    protocolTimeoutMs: 60_000,
    maxConcurrencyPerKey: 2,
  },
  sql: { kind: "postgres", url: "postgresql://lcase:lcase@127.0.0.1:1/nope" },
  artifacts: {
    kind: "s3",
    bucket: "nope",
    endpoint: "http://127.0.0.1:1",
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: "nope", secretAccessKey: "nope" },
  },
  messaging: { kind: "redis-streams", url: "redis://127.0.0.1:1" },
};

describe("createWorkerHost", () => {
  // Construction is the assertion. Every way this host could mis-wire its
  // messaging throws rather than returning something wrong:
  //
  //   publisher() -- this role is not permitted to publish that topic
  //   bind()      -- that subscription is not in this role's plan
  //   seal()      -- some subscription the plan declares went unbound
  //
  // So reaching the end is what establishes that this process binds the Worker
  // command subscription, publishes the terminal topic, and does neither of
  // Engine's or Observability's work. Enforced, not conventional.
  it("composes the whole graph without reaching a backend", () => {
    const host = createWorkerHost(config);

    expect(host.runtime.start).toBeInstanceOf(Function);
    expect(host.runtime.stop).toBeInstanceOf(Function);
    expect(host.runtime.health).toBeInstanceOf(Function);
  });

  // Nothing calls into a Worker host -- it is driven entirely by Messages on the
  // subscription it binds -- so there is no service surface, no tap, and no
  // loose infrastructure handle to hand back.
  it("returns a runtime and nothing else", () => {
    expect(Object.keys(createWorkerHost(config))).toEqual(["runtime"]);
  });
});
