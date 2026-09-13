import { describe, expect, it } from "vitest";
import {
  assertInProcessRealizable,
  assertManifest,
} from "../src/assert-manifest.js";
import type { MessagingManifest } from "../src/manifest.js";
import {
  syntheticCatalog,
  syntheticDeployment,
  requests,
  outcomes,
  engineRequests,
  auditAll,
  reporterOutcomes,
} from "./helpers/synthetic-deployment.js";

// Every case starts from a manifest that passes and breaks exactly one thing,
// so a failure names the rule that caught it rather than the first rule to run.
const broken = (change: Partial<MessagingManifest>): MessagingManifest => ({
  ...syntheticDeployment,
  ...change,
});

const reject = (manifest: MessagingManifest): string => {
  try {
    assertManifest(syntheticCatalog, manifest);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected assertManifest to reject this manifest");
};

describe("assertManifest", () => {
  it("accepts a complete deployment", () => {
    expect(() =>
      assertManifest(syntheticCatalog, syntheticDeployment),
    ).not.toThrow();
  });

  it("rejects an identity the catalog never declared", () => {
    expect(
      reject(broken({ topicIds: [requests.id, outcomes.id, "invented.v1"] })),
    ).toContain("catalog does not declare");
  });

  it("rejects a subscription whose selected topic is not enabled", () => {
    // auditAll spans both topics, so disabling one leaves it half-connected --
    // a consumer that looks wired and silently never hears about outcomes.
    expect(
      reject(
        broken({
          topicIds: [requests.id],
          routes: syntheticDeployment.routes.filter(
            (r) => r.topicId === requests.id,
          ),
        }),
      ),
    ).toContain("that topic is not enabled");
  });

  it("rejects an enabled edge bound to no route", () => {
    expect(
      reject(
        broken({
          routes: syntheticDeployment.routes.filter(
            (r) => r.subscriptionId !== auditAll.id,
          ),
        }),
      ),
    ).toContain("binds it to no route");
  });

  it("rejects a route for an edge the catalog does not describe", () => {
    // reporterOutcomes never selects the requests topic, so this route
    // describes a delivery that cannot happen.
    expect(
      reject(
        broken({
          routes: [
            ...syntheticDeployment.routes,
            {
              topicId: requests.id,
              subscriptionId: reporterOutcomes.id,
              routeId: requests.id,
            },
          ],
        }),
      ),
    ).toContain("is not a delivery edge");
  });

  it("rejects the same edge routed twice", () => {
    expect(
      reject(
        broken({
          routes: [
            ...syntheticDeployment.routes,
            {
              topicId: requests.id,
              subscriptionId: engineRequests.id,
              routeId: "somewhere-else.v1",
            },
          ],
        }),
      ),
    ).toContain(
      "routes 'synthetic-requests.v1 -> synthetic-engine.requests.v1' more than once",
    );
  });

  it("rejects a subscription assigned to no role", () => {
    expect(
      reject(
        broken({
          roles: syntheticDeployment.roles.map((role) => ({
            ...role,
            consumesFrom: role.consumesFrom.filter((s) => s !== auditAll.id),
          })),
        }),
      ),
    ).toContain("assigns it to no role");
  });

  it("rejects a subscription assigned to two roles", () => {
    expect(
      reject(
        broken({
          roles: syntheticDeployment.roles.map((role) =>
            role.id === "synthetic-gateway-host"
              ? { ...role, consumesFrom: [auditAll.id] }
              : role,
          ),
        }),
      ),
    ).toContain("exactly one role consumes each");
  });

  it("rejects a duplicate role id", () => {
    expect(
      reject(
        broken({
          roles: [
            ...syntheticDeployment.roles,
            { id: "synthetic-cli-host", publishesTo: [], consumesFrom: [] },
          ],
        }),
      ),
    ).toContain("declares role 'synthetic-cli-host' more than once");
  });

  it("rejects a topic no role may publish", () => {
    // Nothing structural stops this: the topic is enabled, routed, and
    // consumed. It is simply a conversation that can never start.
    expect(
      reject(
        broken({
          roles: syntheticDeployment.roles.map((role) => ({
            ...role,
            publishesTo: role.publishesTo.filter((t) => t !== outcomes.id),
          })),
        }),
      ),
    ).toContain("no role permission to publish it");
  });

  // The claim the router used to make at seal(), which cannot stay local once
  // roles split: a Worker host publishes terminals and consumes none of them,
  // so only the whole deployment can see that nobody does.
  it("rejects a topic no enabled subscription selects", () => {
    expect(
      reject(
        broken({
          subscriptionIds: [engineRequests.id],
          routes: syntheticDeployment.routes.filter(
            (r) => r.subscriptionId === engineRequests.id,
          ),
          roles: [
            {
              id: "synthetic-gateway-host",
              publishesTo: [requests.id],
              consumesFrom: [],
            },
            {
              id: "synthetic-engine-host",
              publishesTo: [outcomes.id],
              consumesFrom: [engineRequests.id],
            },
          ],
        }),
      ),
    ).toContain(
      "enables topic 'synthetic-outcomes.v1', which no enabled subscription selects",
    );
  });

  // Only expressible once routes converge, which is what the fixture's audit
  // subscription now does. Moving the reporter onto that same route makes it a
  // reader of a path carrying a topic it never selected -- entries it could
  // only discard, on a manifest every other rule accepts.
  it("rejects a route carrying a topic one of its readers does not consume", () => {
    expect(
      reject(
        broken({
          routes: syntheticDeployment.routes.map((route) =>
            route.subscriptionId === reporterOutcomes.id
              ? { ...route, routeId: "synthetic.audit.v1" }
              : route,
          ),
        }),
      ),
    ).toContain(
      "carries topic 'synthetic-requests.v1' on route 'synthetic.audit.v1', which subscription 'synthetic-reporter.outcomes.v1' also reads without consuming that topic",
    );
  });

  // The converged case that is fine, stated on its own rather than left to the
  // fixture passing: one subscription, both its topics, one route.
  it("accepts several topics converged onto one route for one subscription", () => {
    const audit = syntheticDeployment.routes.filter(
      (r) => r.subscriptionId === auditAll.id,
    );
    expect(audit.map((r) => r.routeId)).toEqual([
      "synthetic.audit.v1",
      "synthetic.audit.v1",
    ]);
    expect(audit.map((r) => r.topicId)).toEqual([requests.id, outcomes.id]);
    expect(() =>
      assertManifest(syntheticCatalog, syntheticDeployment),
    ).not.toThrow();
  });
});

describe("assertInProcessRealizable", () => {
  it("accepts a manifest whose one role hosts everything", () => {
    const embedded = broken({
      roles: [
        {
          id: "synthetic-everything-host",
          publishesTo: [requests.id, outcomes.id],
          consumesFrom: [engineRequests.id, reporterOutcomes.id, auditAll.id],
        },
      ],
    });

    expect(() => assertManifest(syntheticCatalog, embedded)).not.toThrow();
    expect(() => assertInProcessRealizable(embedded)).not.toThrow();
  });

  // The split manifest is what an in-process carrier would otherwise seal as an
  // object graph, silently dropping every Message meant for another role.
  it("rejects a manifest with more than one role", () => {
    expect(() => assertInProcessRealizable(syntheticDeployment)).toThrow(
      /declares roles \[synthetic-gateway-host, synthetic-cli-host, synthetic-engine-host, synthetic-observer-host\]; an in-process carrier realizes only a single-role manifest/,
    );
  });
});
