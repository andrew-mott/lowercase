import { defineSubscription, defineTopicFor } from "../../src/define-topic.js";
import type { MessageCatalog } from "../../src/catalog.js";
import type { MessagingManifest } from "../../src/manifest.js";

/**
 * A deployment with four roles, deliberately not shaped like the real one.
 *
 * The job catalog has one pair of hosts and one conversation, so on its own it
 * cannot show whether these shapes describe a deployment topology or just that
 * one arrangement. This fixture answers that: four roles, a topic two roles
 * publish, a subscription spanning two topics onto one converged route, and a
 * role that consumes nothing at all.
 *
 * Event types are borrowed from the real map because `Topic` requires real
 * ones. Nothing here corresponds to a real conversation.
 */
export const requests = defineTopicFor<"run.requested">()({
  id: "synthetic-requests.v1",
  types: ["run.requested"],
});

export const outcomes = defineTopicFor<"run.completed" | "run.failed">()({
  id: "synthetic-outcomes.v1",
  types: ["run.completed", "run.failed"],
});

export const engineRequests = defineSubscription({
  id: "synthetic-engine.requests.v1",
  topics: [requests],
});

export const reporterOutcomes = defineSubscription({
  id: "synthetic-reporter.outcomes.v1",
  topics: [outcomes],
});

/** One purpose spanning both topics, the shape C20 made possible. */
export const auditAll = defineSubscription({
  id: "synthetic-audit.all.v1",
  topics: [requests, outcomes],
});

export const syntheticCatalog: MessageCatalog = {
  topics: [requests, outcomes],
  subscriptions: [engineRequests, reporterOutcomes, auditAll],
};

/**
 * Four roles over that catalog.
 *
 * `synthetic-gateway-host` consumes nothing, which is the case a two-role
 * fixture cannot reach: a process that publishes into the system and consumes
 * no Messages. `synthetic-cli-host` publishes the same topic as the gateway,
 * proving publish permission is not an ownership claim.
 */
export const syntheticDeployment: MessagingManifest = {
  id: "synthetic-four-role",
  carrier: "redis-streams",
  topicIds: [requests.id, outcomes.id],
  subscriptionIds: [engineRequests.id, reporterOutcomes.id, auditAll.id],
  // Work routes per topic, plus one route both of the audit subscription's
  // edges converge onto -- the same shape the real deployment gives
  // Observability, reached here through four roles instead of one.
  routes: [
    {
      topicId: requests.id,
      subscriptionId: engineRequests.id,
      routeId: "synthetic.requests-work.v1",
    },
    {
      topicId: requests.id,
      subscriptionId: auditAll.id,
      routeId: "synthetic.audit.v1",
    },
    {
      topicId: outcomes.id,
      subscriptionId: reporterOutcomes.id,
      routeId: "synthetic.outcomes-work.v1",
    },
    {
      topicId: outcomes.id,
      subscriptionId: auditAll.id,
      routeId: "synthetic.audit.v1",
    },
  ],
  roles: [
    {
      id: "synthetic-gateway-host",
      publishesTo: [requests.id],
      consumesFrom: [],
    },
    {
      id: "synthetic-cli-host",
      publishesTo: [requests.id],
      consumesFrom: [],
    },
    {
      id: "synthetic-engine-host",
      publishesTo: [outcomes.id],
      consumesFrom: [engineRequests.id],
    },
    {
      id: "synthetic-observer-host",
      publishesTo: [],
      consumesFrom: [reporterOutcomes.id, auditAll.id],
    },
  ],
};
