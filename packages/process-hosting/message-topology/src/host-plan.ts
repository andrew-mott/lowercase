import type {
  MessagingCarrierKind,
  MessagingManifest,
  TopicRoute,
} from "./manifest.js";

/**
 * A topic this role may publish to, and every route its Messages travel.
 *
 * `routeIds` rather than `TopicRoute[]`: the entry is already scoped to one
 * topic, so repeating it inside each route would be noise. No subscription
 * appears here at all, which is the erasure that keeps a publisher from
 * learning who consumes it.
 */
export type PlannedPublisher = {
  topicId: string;
  routeIds: readonly string[];
};

/**
 * A subscription this role consumes from, and every route it must read to do
 * so.
 *
 * `TopicRoute[]` rather than bare route IDs, because one subscription can span
 * several topics and a consumer has to know which topic's Messages arrive on
 * which route.
 */
export type PlannedSubscription = {
  subscriptionId: string;
  topicRoutes: readonly TopicRoute[];
};

/**
 * One process role's whole view of the deployment: what it may publish to, what
 * it must consume from, and the physical routes for both.
 *
 * Keeps the role's two verbs rather than renaming them for their richer
 * contents, because it is the same relationship with routing resolved. Reading
 * a role and its plan side by side should not need a translation step.
 *
 * Deliberately not a hand-written counterpart to another host's plan. Two
 * processes that each authored their own would drift on route identity with
 * nothing to catch it, which is the failure this whole layer exists to remove.
 * A plan is derived from the shared manifest, so agreement is structural.
 *
 * It names no other role. A Worker host knows the routes its own conversations
 * travel and not who is on the other end, which is exactly what lets the two
 * ends live in different processes.
 */
export type MessagingHostPlan = {
  manifestId: string;
  roleId: string;
  carrier: MessagingCarrierKind;
  publishesTo: readonly PlannedPublisher[];
  consumesFrom: readonly PlannedSubscription[];
};

/**
 * Projects one role out of a deployment manifest.
 *
 * Needs no catalog. Routes are keyed by delivery edge, so a subscription's
 * topic routes and a topic's route IDs both fall out of filtering
 * `manifest.routes` -- which also means a host never imports protocol modules
 * for conversations it does not take part in.
 *
 * Assumes a validated manifest. `assertManifest` is what proves every edge is
 * routed and every subscription assigned; this only projects.
 */
export function hostPlanFor(
  manifest: MessagingManifest,
  roleId: string,
): MessagingHostPlan {
  const role = manifest.roles.find((r) => r.id === roleId);
  if (!role) {
    const known = manifest.roles.map((r) => r.id).join(", ");
    throw new Error(
      `[message-topology] manifest '${manifest.id}' declares no role '${roleId}'; it declares [${known}]`,
    );
  }

  const publishesTo = role.publishesTo.map((topicId) => ({
    topicId,
    routeIds: [
      ...new Set(
        manifest.routes
          .filter((route) => route.topicId === topicId)
          .map((route) => route.routeId),
      ),
    ],
  }));

  const consumesFrom = role.consumesFrom.map(
    (subscriptionId): PlannedSubscription => ({
      subscriptionId,
      topicRoutes: manifest.routes
        .filter((route) => route.subscriptionId === subscriptionId)
        .map((route) => ({ topicId: route.topicId, routeId: route.routeId })),
    }),
  );

  return {
    manifestId: manifest.id,
    roleId: role.id,
    carrier: manifest.carrier,
    publishesTo,
    consumesFrom,
  };
}
