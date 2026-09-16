import { describe, expect, it } from "vitest";
import { createApiHost } from "../../src/profiles/api-host/api-host.profile.js";
import type { ApiHostConfig } from "../../src/profiles/api-host/api-host.config.js";

// Every address is deliberately dead. Composition must not reach any of them,
// so a config that could only fail is the strongest form of that assertion.
//
// No optional sinks: the two projection sinks attach regardless, and the replay
// sink would write a directory under the working directory for no benefit here.
const config: ApiHostConfig = {
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
  observability: { sinks: [] },
};

describe("createApiHost", () => {
  // Construction is the assertion. Every way this host could mis-wire its
  // messaging throws rather than returning something wrong:
  //
  //   publisher() -- this role is not permitted to publish that topic
  //   bind()      -- that subscription is not in this role's plan
  //   seal()      -- some subscription the plan declares went unbound
  //
  // So reaching the end establishes that this process publishes commands, binds
  // both of the subscriptions that are not Worker's, and binds neither more nor
  // fewer. Enforced by the router, not by convention.
  it("composes the whole graph without reaching a backend", () => {
    const host = createApiHost(config);

    expect(host.runtime.start).toBeInstanceOf(Function);
    expect(host.runtime.stop).toBeInstanceOf(Function);
    expect(host.runtime.health).toBeInstanceOf(Function);
  });

  // The same three things the embedded profile returns, which is what lets one
  // HTTP layer serve either without knowing which composed it.
  it("returns the services, runtime and tap the HTTP layer needs", () => {
    expect(Object.keys(createApiHost(config)).sort()).toEqual([
      "runtime",
      "services",
      "tap",
    ]);
  });

  it("exposes every service the routes resolve from the container", () => {
    const { services } = createApiHost(config);

    // The routes reach these off a decorated Fastify instance, where a missing
    // one is a runtime `undefined` rather than a type error.
    expect(Object.keys(services).sort()).toEqual([
      "artifact",
      "eval",
      "flow",
      "replay",
      "run",
      "sim",
    ]);
  });
});
