import { describe, expect, it } from "vitest";
import { workerHostPlan } from "../src/host-plan.js";

describe("workerHostPlan", () => {
  it("resolves the remote-worker manifest for the worker-host role", () => {
    const plan = workerHostPlan();

    expect(plan.manifestId).toBe("remote-worker");
    expect(plan.roleId).toBe("worker-host");
    // An in-process carrier cannot realize this manifest at all: a host serving
    // Worker's subscription would be delivering to lanes the other host owns.
    expect(plan.carrier).toBe("redis-streams");
  });

  it("consumes the Worker command subscription and nothing else", () => {
    const plan = workerHostPlan();

    expect(plan.consumesFrom.map((c) => c.subscription.id)).toEqual([
      "worker.job-command.v1",
    ]);
  });

  it("publishes terminals onto both routes without naming who reads them", () => {
    const plan = workerHostPlan();

    expect(plan.publishesTo.map((p) => p.topic.id)).toEqual([
      "job-terminal.v1",
    ]);
    // Two routes for one topic, because Engine and Observability read it on
    // separate streams -- and the subscription is erased from both, so nothing
    // here tells this host that either consumer exists.
    expect([...plan.publishesTo[0].routeIds].sort()).toEqual([
      "job.observation.v1",
      "job.terminal-work.v1",
    ]);
  });
});
