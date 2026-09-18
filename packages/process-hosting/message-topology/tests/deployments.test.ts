import { describe, expect, it } from "vitest";
import { assertCatalog } from "../src/catalog.js";
import { assertManifest } from "../src/assert-manifest.js";
import {
  jobCatalog,
  engineJobTerminalSubscription,
  observabilityJobSubscription,
  workerJobCommandSubscription,
} from "../src/catalogs/job.catalog.js";
import {
  localSystemInProcess,
  localSystemRedis,
} from "../src/deployments/local-system.deployment.js";
import { remoteWorker } from "../src/deployments/remote-worker.deployment.js";
import {
  syntheticCatalog,
  syntheticDeployment,
} from "./helpers/synthetic-deployment.js";

describe("shipped deployments", () => {
  it("declares a valid job catalog", () => {
    expect(() => assertCatalog(jobCatalog)).not.toThrow();
  });

  it.each([
    ["local-system-in-process", localSystemInProcess],
    ["local-system-redis", localSystemRedis],
    ["remote-worker", remoteWorker],
  ])("validates %s against the job catalog", (_name, manifest) => {
    expect(() => assertManifest(jobCatalog, manifest)).not.toThrow();
  });

  // Four roles, one of them serving nothing. The real deployments have at most
  // two roles and one conversation, so without this the representation would be
  // untested beyond the arrangement that motivated it.
  it("validates a four-role deployment including a role that consumes nothing", () => {
    expect(() =>
      assertManifest(syntheticCatalog, syntheticDeployment),
    ).not.toThrow();
    expect(syntheticDeployment.roles).toHaveLength(4);
    expect(
      syntheticDeployment.roles.filter((r) => r.consumesFrom.length === 0),
    ).toHaveLength(2);
  });

  // No route ID is a topic ID. While they were equal, code that reached for a
  // topic where it meant a route passed every test by coincidence; keeping them
  // distinct is what makes a stream key a physical path rather than a
  // conversation.
  it.each([
    ["local-system-redis", localSystemRedis],
    ["remote-worker", remoteWorker],
  ])("gives every %s route an identity no topic has", (_name, manifest) => {
    const topicIds = new Set<string>(manifest.topicIds);
    for (const route of manifest.routes) {
      expect(topicIds.has(route.routeId)).toBe(false);
    }
  });

  // Route convergence, asserted on the presets rather than only on a
  // fixture: Observability's two edges name one route, and the two work routes
  // stay separate so Worker and Engine are unaffected by it.
  it.each([
    ["local-system-redis", localSystemRedis],
    ["remote-worker", remoteWorker],
  ])(
    "converges both %s observation edges onto one route",
    (_name, manifest) => {
      const routeFor = (subscriptionId: string): string[] =>
        manifest.routes
          .filter((r) => r.subscriptionId === subscriptionId)
          .map((r) => r.routeId);

      const observation = routeFor(observabilityJobSubscription.id);
      expect(observation).toHaveLength(2);
      expect(new Set(observation).size).toBe(1);

      const work = [
        ...routeFor(workerJobCommandSubscription.id),
        ...routeFor(engineJobTerminalSubscription.id),
      ];
      expect(new Set(work).size).toBe(2);
      expect(work).not.toContain(observation[0]);
    },
  );

  // The two carrier variants differ in exactly one field. If they ever drift,
  // the embedded graph would mean something different depending on how it was
  // configured, which is precisely what one shared manifest exists to prevent.
  it("keeps both embedded variants identical apart from the carrier", () => {
    const { id: _a, carrier: inProcess, ...restA } = localSystemInProcess;
    const { id: _b, carrier: redis, ...restB } = localSystemRedis;

    expect(restA).toEqual(restB);
    expect([inProcess, redis]).toEqual(["in-process", "redis-streams"]);
  });

  // assertManifest cannot make this claim: a manifest that simply forgot to
  // enable a topic is internally consistent, just smaller than the catalog.
  // "Complete embedded graph" is a claim about the embedded deployment
  // specifically, so it is asserted where it is made.
  it("enables the whole catalog in the embedded deployment", () => {
    expect([...localSystemInProcess.topicIds].sort()).toEqual(
      jobCatalog.topics.map((t) => t.id).sort(),
    );
    expect([...localSystemInProcess.subscriptionIds].sort()).toEqual(
      jobCatalog.subscriptions.map((s) => s.id).sort(),
    );
  });

  // A split deployment is only meaningful if the two roles are genuinely
  // disjoint. Overlap here would mean two processes racing for the same
  // subscription without the manifest saying so.
  it("splits remote-worker responsibilities with no overlap", () => {
    const served = remoteWorker.roles.flatMap((r) => r.consumesFrom);
    expect(new Set(served).size).toBe(served.length);
    expect(served).toHaveLength(remoteWorker.subscriptionIds.length);
  });
});
