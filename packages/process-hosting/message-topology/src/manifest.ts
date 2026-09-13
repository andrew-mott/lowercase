/**
 * Which carrier family moves this deployment's Messages. One choice for the
 * whole deployment, not one per conversation.
 *
 * That is a deliberate restriction of the current deployment model rather than
 * a limit of these shapes. Routes are keyed per delivery edge, so a
 * finer-grained choice would live on `DeliveryRoute` if it were ever wanted.
 * Nothing plans to support it.
 *
 * Endpoints, credentials, and this process's consumer name are not here. They
 * are process configuration: two hosts in one deployment share the carrier
 * family and the route identities while reaching Redis differently.
 */
export type MessagingCarrierKind = "in-process" | "redis-streams";

/**
 * One delivery edge and the physical route that carries it.
 *
 * Keyed by `(topicId, subscriptionId)` rather than by topic alone, which is
 * what lets one topic reach a work route and a shared observation route at the
 * same time. Nothing uses that yet; every route here maps one topic to one
 * route ID. It is represented now so adding the second route is a data change.
 *
 * The route ID is carrier-neutral. A log-backed carrier derives its stream key
 * from it, an in-process carrier ignores it entirely.
 */
export type DeliveryRoute = {
  topicId: string;
  subscriptionId: string;
  routeId: string;
};

/**
 * One topic and the route carrying it, with the subscription dropped.
 *
 * The recurring half of a `DeliveryRoute`: a consumer needs to know which route
 * to read and which topic's Messages will arrive on it, and has no use for its
 * own ID repeated on every entry. A carrier's runtime shape is this plus a
 * connection -- the Redis router's `BoundReader` pairs the same topic ID with a
 * stream key.
 */
export type TopicRoute = {
  topicId: string;
  routeId: string;
};

/**
 * One process role in a deployment, named for what it hosts.
 *
 * Never named for being the remainder: there is no `main-host`. A role that
 * hosts the HTTP API, Engine, and Observability says so, so that a later
 * deployment which splits Engine out produces a different role rather than the
 * same name quietly meaning less than it did.
 *
 * `publishesTo` is a permission and `consumesFrom` is a responsibility: a
 * deployment assigns each subscription to exactly one role, so naming it here
 * is ownership rather than compulsion. A role that consumes nothing is
 * legitimate: a gateway may publish commands and read no Messages at all.
 *
 * The two hold different kinds of identity, and the verbs are what say which.
 * You publish to a topic and consume from a subscription, so `publishesTo`
 * holds topic IDs while `consumesFrom` holds subscription IDs. That asymmetry
 * is the point rather than an inconsistency: a publisher names a topic and
 * never a consumer list, which is what lets two ends of one conversation live
 * in different processes with neither naming the other.
 */
export type MessagingRole = {
  id: string;
  publishesTo: readonly string[];
  consumesFrom: readonly string[];
};

/**
 * One deployment's complete messaging topology: which catalog identities it
 * enables, how each delivery edge is routed, and which role owns what.
 *
 * Complete on purpose. A manifest describes every cooperating role rather than
 * one process's view, which is what lets two hosts derive compatible route
 * identities without either naming the other. A host plan is then a projection
 * of this, never a hand-written counterpart.
 *
 * Identities are IDs rather than catalog objects so that a running process can
 * consume a manifest without importing every protocol module the deployment
 * mentions. Validation against the catalog belongs at the deployment-definition
 * boundary and its tests.
 *
 * Hence `topicIds` and `subscriptionIds` rather than `topics` and
 * `subscriptions`: those bare names belong to `MessageCatalog`, where they hold
 * the declarations themselves. The suffix marks the difference between owning a
 * declaration and referring to one, which matters most in `assertManifest`,
 * where both are in scope at once. `routes` and `roles` stay bare because they
 * hold records rather than references.
 */
export type MessagingManifest = {
  id: string;
  carrier: MessagingCarrierKind;
  topicIds: readonly string[];
  subscriptionIds: readonly string[];
  routes: readonly DeliveryRoute[];
  roles: readonly MessagingRole[];
};

/** The edge key used to compare and deduplicate delivery routes. */
export function edgeKey(topicId: string, subscriptionId: string): string {
  return `${topicId} -> ${subscriptionId}`;
}
