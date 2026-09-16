import { describe, expect, it } from "vitest";
import { apiHostPlan } from "../../src/profiles/api-host/host-plan.js";

describe("apiHostPlan", () => {
  it("resolves the remote-worker manifest for the api-engine-observer role", () => {
    const plan = apiHostPlan();

    expect(plan.manifestId).toBe("remote-worker");
    expect(plan.roleId).toBe("api-engine-observer-host");
    // The manifest is Redis-only: an in-process carrier cannot realize a
    // deployment whose other half is a different process.
    expect(plan.carrier).toBe("redis-streams");
  });

  it("consumes Engine's and Observability's subscriptions and not Worker's", () => {
    const plan = apiHostPlan();

    expect(plan.consumesFrom.map((c) => c.subscription.id).sort()).toEqual([
      "engine.job-terminal.v1",
      "observability.job.v1",
    ]);
  });

  it("publishes commands and never terminals", () => {
    const plan = apiHostPlan();

    // The asymmetry this arc rests on, from the other side: the Worker host
    // publishes terminals and consumes commands, and neither plan names the
    // other host.
    expect(plan.publishesTo.map((p) => p.topic.id)).toEqual(["job-command.v1"]);
  });

  it("carries one published topic onto both the work and observation routes", () => {
    const plan = apiHostPlan();

    // Two routes for one topic, with the subscription erased from both -- so
    // nothing here tells this host that a Worker consumes one of them and the
    // tap consumes the other.
    expect([...plan.publishesTo[0].routeIds].sort()).toEqual([
      "job.command-work.v1",
      "job.observation.v1",
    ]);
  });
});
