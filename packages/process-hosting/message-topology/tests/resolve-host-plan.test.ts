import { describe, expect, it } from "vitest";
import { hostPlanFor } from "../src/host-plan.js";
import { resolveHostPlan } from "../src/resolve-host-plan.js";
import type { MessagingHostPlan } from "../src/host-plan.js";
import { jobCatalog } from "../src/catalogs/job.catalog.js";
import { remoteWorker } from "../src/deployments/remote-worker.deployment.js";
import {
  syntheticCatalog,
  syntheticDeployment,
  requests,
  engineRequests,
} from "./helpers/synthetic-deployment.js";

describe("resolveHostPlan", () => {
  // The join itself: ids in, declarations out, routes carried through
  // untouched.
  it("gives each planned identity the declaration that says what it carries", () => {
    const resolved = resolveHostPlan(
      hostPlanFor(remoteWorker, "worker-host"),
      jobCatalog,
    );

    expect(resolved.publishesTo).toHaveLength(1);
    expect(resolved.publishesTo[0]?.topic.id).toBe("job-terminal.v1");
    expect(resolved.publishesTo[0]?.topic.types).toEqual([
      "job.httpjson.completed",
      "job.httpjson.failed",
    ]);
    expect(resolved.publishesTo[0]?.routeIds).toEqual(["job-terminal.v1"]);

    expect(resolved.consumesFrom).toHaveLength(1);
    expect(resolved.consumesFrom[0]?.subscription.id).toBe(
      "worker.job-command.v1",
    );
    expect(resolved.consumesFrom[0]?.topicRoutes).toEqual([
      { topicId: "job-command.v1", routeId: "job-command.v1" },
    ]);
  });

  it("carries the manifest, role, and carrier through unchanged", () => {
    const resolved = resolveHostPlan(
      hostPlanFor(remoteWorker, "api-engine-observer-host"),
      jobCatalog,
    );

    expect(resolved.manifestId).toBe("remote-worker");
    expect(resolved.roleId).toBe("api-engine-observer-host");
    expect(resolved.carrier).toBe("redis-streams");
  });

  // The error this step exists for. A host assigned a subscription whose
  // protocol module it never imported fails here naming the declaration, where
  // before it surfaced much later at seal() as a consumer nobody wired.
  it("rejects a planned subscription this process's catalog does not declare", () => {
    expect(() =>
      resolveHostPlan(
        hostPlanFor(syntheticDeployment, "synthetic-engine-host"),
        {
          topics: syntheticCatalog.topics,
          subscriptions: syntheticCatalog.subscriptions.filter(
            (s) => s.id !== engineRequests.id,
          ),
        },
      ),
    ).toThrow(
      /consumes subscription 'synthetic-engine.requests.v1', which this process's catalog does not declare/,
    );
  });

  it("rejects a planned topic this process's catalog does not declare", () => {
    expect(() =>
      resolveHostPlan(
        hostPlanFor(syntheticDeployment, "synthetic-gateway-host"),
        {
          topics: syntheticCatalog.topics.filter((t) => t.id !== requests.id),
          subscriptions: [],
        },
      ),
    ).toThrow(
      /may publish topic 'synthetic-requests.v1', which this process's catalog does not declare/,
    );
  });

  // The declaration and the deployment are authored in different files by
  // different concerns. A topic added to a subscription without adding its
  // delivery edge would otherwise leave a consumer reading every route it was
  // given and silently never seeing the new topic.
  it("rejects a plan whose routes disagree with what the subscription selects", () => {
    const plan = hostPlanFor(syntheticDeployment, "synthetic-observer-host");
    const narrowed: MessagingHostPlan = {
      ...plan,
      consumesFrom: plan.consumesFrom.map((s) =>
        s.subscriptionId === "synthetic-audit.all.v1"
          ? { ...s, topicRoutes: s.topicRoutes.slice(0, 1) }
          : s,
      ),
    };

    expect(() => resolveHostPlan(narrowed, syntheticCatalog)).toThrow(
      /routes subscription 'synthetic-audit.all.v1' for \[synthetic-requests.v1\], but it is declared as selecting \[synthetic-requests.v1, synthetic-outcomes.v1\]/,
    );
  });

  // One-directional on purpose: a host that imported conversations it takes no
  // part in is over-supplied, not wrong.
  it("accepts a catalog holding more than the plan names", () => {
    expect(() =>
      resolveHostPlan(
        hostPlanFor(syntheticDeployment, "synthetic-gateway-host"),
        syntheticCatalog,
      ),
    ).not.toThrow();
  });
});
