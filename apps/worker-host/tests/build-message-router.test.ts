import { describe, expect, it } from "vitest";
import { hostPlanFor, resolveHostPlan } from "@lcase/message-topology";
import { jobCatalog } from "@lcase/message-topology/catalogs";
import {
  localSystemInProcess,
  localSystemRole,
} from "@lcase/message-topology/deployments";
import { buildMessageRouter } from "../src/profile/build-message-router.js";
import { workerHostPlan } from "../src/host-plan.js";

// Refused fast rather than hung: nothing listens on port 1.
const config = { kind: "redis-streams", url: "redis://127.0.0.1:1" } as const;

describe("buildMessageRouter", () => {
  // Optional on `LifecycleHooks`, so hooks: {} would typecheck and leave the
  // router's read loops unstarted and its connections unclosed.
  it("returns a router with start and stop hooks", () => {
    const { router, hooks } = buildMessageRouter(config, workerHostPlan());

    expect(router.seal).toBeInstanceOf(Function);
    expect(hooks.start).toBeInstanceOf(Function);
    expect(hooks.stop).toBeInstanceOf(Function);
  });

  // The profile builds this synchronously; connecting is start()'s job. Same
  // property build-sql-client.test.ts asserts, and for the same reason: an
  // unreachable backend has to arrive as a start outcome, not as a throw out of
  // composition.
  it("does not connect while constructing", () => {
    expect(() => buildMessageRouter(config, workerHostPlan())).not.toThrow();
  });

  // Unreachable through the profile, which resolves one manifest for one role.
  // It is here because the config narrows to the Redis connection fields while
  // the plan is the authority on the carrier -- two sources describing one fact,
  // so one has to be checked against the other rather than silently winning.
  //
  // The disagreeing plan is a real one another role would derive, not a
  // hand-built object, so the check is exercised against something production
  // could actually produce.
  it("refuses a plan whose carrier disagrees with the config", () => {
    const inProcessPlan = resolveHostPlan(
      hostPlanFor(localSystemInProcess, localSystemRole.id),
      jobCatalog,
    );

    expect(() => buildMessageRouter(config, inProcessPlan)).toThrow(
      /messaging config selects 'redis-streams' but host plan 'local-system-in-process' is carried by 'in-process'/,
    );
  });
});
