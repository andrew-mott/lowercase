import { describe, expect, it } from "vitest";
import { buildMessageRouter } from "../src/build-message-router.js";
import { manifestFor } from "../src/select-manifest.js";
import { hostPlanFor, resolveHostPlan } from "@lcase/message-topology";
import { localSystemRole } from "@lcase/message-topology/deployments";
import { jobCatalog } from "@lcase/message-topology/catalogs";
import type { MessagingUserConfig } from "@lcase/types";

// The chain the profile runs, so the branch below is exercised on a plan
// production could actually have produced rather than a hand-built one.
const planFor = (kind: MessagingUserConfig["kind"]) =>
  resolveHostPlan(
    hostPlanFor(manifestFor(kind), localSystemRole.id),
    jobCatalog,
  );

describe("buildMessageRouter", () => {
  // Both carriers satisfy MessageRouter structurally, so the branch is told
  // apart by what actually differs: whether there is anything to start.
  it("returns a router with no lifecycle for an in-process config", () => {
    const { router, hooks } = buildMessageRouter(
      { kind: "in-process" },
      planFor("in-process"),
    );

    expect(router.seal).toBeInstanceOf(Function);
    expect(hooks.start).toBeUndefined();
    expect(hooks.stop).toBeUndefined();
  });

  it("returns a router with start/stop hooks for a redis-streams config", () => {
    const { router, hooks } = buildMessageRouter(
      { kind: "redis-streams", url: "redis://localhost:6379" },
      planFor("redis-streams"),
    );

    expect(router.seal).toBeInstanceOf(Function);
    expect(hooks.start).toBeInstanceOf(Function);
    expect(hooks.stop).toBeInstanceOf(Function);
  });

  // Construction must not connect: the profile builds the router
  // synchronously, and connecting is start()'s job.
  it("does not connect to Redis while constructing", () => {
    expect(() =>
      buildMessageRouter(
        { kind: "redis-streams", url: "redis://127.0.0.1:1" },
        planFor("redis-streams"),
      ),
    ).not.toThrow();
  });

  // Unreachable through the profile, which derives the manifest from this same
  // config value. It is here because the config is what narrows to the Redis
  // connection fields while the plan is the authority on the carrier, so one of
  // the two has to be checked against the other rather than silently winning.
  it("refuses a plan whose carrier disagrees with the config", () => {
    expect(() =>
      buildMessageRouter({ kind: "in-process" }, planFor("redis-streams")),
    ).toThrow(
      /messaging config selects 'in-process' but host plan 'local-system-redis' is carried by 'redis-streams'/,
    );
  });
});
