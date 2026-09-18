import type { MessageCatalog } from "./catalog.js";
import { edgeKey, type MessagingManifest } from "./manifest.js";

const err = (message: string): never => {
  throw new Error(`[message-topology] ${message}`);
};

/**
 * Everything a deployment definition can settle on its own, checked where it
 * can be known.
 *
 * This is not a process check. It cannot tell whether a host bound a handler,
 * and it cannot prove another process is running -- remote liveness belongs to
 * deployment health. What it can prove is that the description is internally
 * complete: every enabled edge is routed exactly once, every enabled
 * subscription is somebody's job, and nothing here invents an identity the
 * catalog never declared.
 *
 * Belongs at the deployment-definition boundary, in its tests, or in preflight.
 * A running process consumes the ID-based manifest and should not re-import the
 * aggregate catalog just to re-run this.
 */
export function assertManifest(
  catalog: MessageCatalog,
  manifest: MessagingManifest,
): void {
  const at = `manifest '${manifest.id}'`;

  const catalogTopics = new Map(catalog.topics.map((t) => [t.id, t]));
  const catalogSubs = new Map(catalog.subscriptions.map((s) => [s.id, s]));

  const manifestTopics = new Set(manifest.topicIds);
  const manifestSubs = new Set(manifest.subscriptionIds);

  for (const topicId of manifestTopics) {
    if (!catalogTopics.has(topicId)) {
      err(
        `${at} enables topic '${topicId}', which the catalog does not declare`,
      );
    }
  }
  for (const subscriptionId of manifestSubs) {
    if (!catalogSubs.has(subscriptionId)) {
      err(
        `${at} enables subscription '${subscriptionId}', which the catalog does not declare`,
      );
    }
  }

  // The enabled set has to be closed under selection. A subscription whose
  // topic is disabled would otherwise be a consumer of nothing, which reads as
  // a working deployment right up until no Message ever arrives.
  const expectedEdges = new Map<string, { topicId: string; subId: string }>();
  for (const subscriptionId of manifestSubs) {
    const subscription = catalogSubs.get(subscriptionId)!;
    for (const topic of subscription.topics) {
      if (!manifestTopics.has(topic.id)) {
        err(
          `${at} enables subscription '${subscriptionId}', which selects topic '${topic.id}', but that topic is not enabled`,
        );
      }
      expectedEdges.set(edgeKey(topic.id, subscriptionId), {
        topicId: topic.id,
        subId: subscriptionId,
      });
    }
  }

  // A topic no enabled subscription selects can never arrive anywhere. The
  // router used to catch this locally at seal(), and cannot once roles split:
  // a Worker host legitimately publishes terminals and consumes none of them,
  // so only the whole deployment can see that nobody does.
  const consumedTopics = new Set(
    [...expectedEdges.values()].map((edge) => edge.topicId),
  );
  for (const topicId of manifestTopics) {
    if (!consumedTopics.has(topicId)) {
      err(
        `${at} enables topic '${topicId}', which no enabled subscription selects`,
      );
    }
  }

  // Exactly one route per enabled edge. Both directions are checked: a missing
  // route is an undeliverable edge, and an extra one is a route to a
  // conversation this deployment did not enable.
  const routed = new Map<string, string>();
  const routeTopics = new Map<string, Set<string>>();
  const routeSubs = new Map<string, Set<string>>();
  for (const route of manifest.routes) {
    const key = edgeKey(route.topicId, route.subscriptionId);
    if (!expectedEdges.has(key)) {
      err(
        `${at} routes '${key}', which is not a delivery edge of its enabled catalog entries`,
      );
    }
    if (routed.has(key)) {
      err(`${at} routes '${key}' more than once`);
    }
    routed.set(key, route.routeId);

    const topics = routeTopics.get(route.routeId) ?? new Set<string>();
    topics.add(route.topicId);
    routeTopics.set(route.routeId, topics);
    const subs = routeSubs.get(route.routeId) ?? new Set<string>();
    subs.add(route.subscriptionId);
    routeSubs.set(route.routeId, subs);
  }
  for (const key of expectedEdges.keys()) {
    if (!routed.has(key)) {
      err(`${at} enables delivery edge '${key}' but binds it to no route`);
    }
  }

  // Every subscription on a route has to consume everything that route carries.
  // Several edges sharing a route ID is the mechanism behind a shared
  // observation path, and it is also the only way to express a route carrying a
  // topic one of its own readers does not want: that reader would receive
  // entries it can only discard, on a manifest that otherwise validates.
  //
  // Checked after the per-edge loop so a missing or duplicated route is still
  // reported first -- this message would otherwise describe a route table that
  // was never complete.
  for (const [routeId, topics] of routeTopics) {
    for (const subscriptionId of routeSubs.get(routeId)!) {
      for (const topicId of topics) {
        if (routed.get(edgeKey(topicId, subscriptionId)) !== routeId) {
          err(
            `${at} carries topic '${topicId}' on route '${routeId}', which subscription '${subscriptionId}' also reads without consuming that topic`,
          );
        }
      }
    }
  }

  // Role identities, then assignment. Duplicate role IDs are checked first so
  // that a later "assigned twice" message cannot really mean "declared twice".
  const seenRoles = new Set<string>();
  const servedBy = new Map<string, string>();
  const publishedBy = new Set<string>();
  for (const role of manifest.roles) {
    if (seenRoles.has(role.id)) {
      err(`${at} declares role '${role.id}' more than once`);
    }
    seenRoles.add(role.id);

    for (const topicId of role.publishesTo) {
      if (!manifestTopics.has(topicId)) {
        err(
          `${at} lets role '${role.id}' publish topic '${topicId}', which is not enabled`,
        );
      }
      publishedBy.add(topicId);
    }

    for (const subscriptionId of role.consumesFrom) {
      if (!manifestSubs.has(subscriptionId)) {
        err(
          `${at} assigns subscription '${subscriptionId}' to role '${role.id}', but that subscription is not enabled`,
        );
      }
      const owner = servedBy.get(subscriptionId);
      if (owner !== undefined) {
        err(
          `${at} assigns subscription '${subscriptionId}' to both '${owner}' and '${role.id}'; exactly one role consumes each`,
        );
      }
      servedBy.set(subscriptionId, role.id);
    }
  }

  for (const subscriptionId of manifestSubs) {
    if (!servedBy.has(subscriptionId)) {
      err(
        `${at} enables subscription '${subscriptionId}' but assigns it to no role`,
      );
    }
  }

  // A topic nobody may publish is a conversation that can never start. Checked
  // last because it is the weakest claim: it says a publisher exists somewhere
  // in the deployment, not that any process is running one.
  for (const topicId of manifestTopics) {
    if (!publishedBy.has(topicId)) {
      err(
        `${at} enables topic '${topicId}' but gives no role permission to publish it`,
      );
    }
  }
}

/**
 * Whether one process can realize this whole manifest.
 *
 * A single role is exactly equivalent to "everything is local" for a manifest
 * `assertManifest` has already accepted: every enabled subscription is assigned
 * to exactly one role and every enabled topic has a publishing role, so one
 * role means both belong to it. That equivalence is why this needs no host
 * plan -- and it could not use one, since a plan names no role but its own and
 * so cannot see that another exists.
 *
 * A restriction of the current deployment model rather than of these shapes. A
 * deployment picks one carrier for everything, so a split manifest realized in
 * process would deliver to the lanes this process owns and silently drop every
 * Message meant for another role. Routes are keyed per delivery edge, so a
 * per-conversation carrier would live there if it were ever wanted.
 */
export function assertInProcessRealizable(manifest: MessagingManifest): void {
  if (manifest.roles.length !== 1) {
    const names = manifest.roles.map((r) => r.id).join(", ");
    err(
      `manifest '${manifest.id}' declares roles [${names}]; an in-process carrier realizes only a single-role manifest, because one deployment picks one carrier and every Message this one moves stays in this process`,
    );
  }
}
