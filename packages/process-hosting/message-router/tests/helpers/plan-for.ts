import {
  assertManifest,
  hostPlanFor,
  resolveHostPlan,
  type DeliveryRoute,
  type MessageCatalog,
  type MessagingCarrierKind,
  type MessagingManifest,
  type ResolvedHostPlan,
} from "@lcase/message-topology";

export const TEST_ROLE_ID = "test-host";

/**
 * The single-role deployment these tests used to pass a carrier directly, now
 * expressed the way production builds one.
 *
 * A carrier's subject is delivery, not deployment, so its tests declare the
 * conversation they care about and let this derive the rest: everything
 * enabled, one role publishing and consuming all of it, one route per delivery
 * edge. That is exactly the embedded shape, which is the one a carrier test
 * should be exercising.
 *
 * It goes through `assertManifest` and `hostPlanFor` rather than hand-building
 * a resolved plan, so a carrier is always handed something production could
 * actually have produced. A hand-built plan would let these tests drift into a
 * shape the projection never emits.
 *
 * The catalog stays the tests' own fake topics. A carrier knows no product
 * identities, and neither should anything checking one.
 */
export function planFor(
  catalog: MessageCatalog,
  carrier: MessagingCarrierKind = "in-process",
  /**
   * How each delivery edge is routed. The default gives every topic its own
   * route under a name no topic has, so a carrier reaching for a topic id where
   * it means a route id fails here rather than passing by coincidence.
   * Overriding it is how a test reaches a shape the shipped presets do not have
   * -- one topic on several routes, or several topics converged onto one.
   */
  routeIdFor: (topicId: string, subscriptionId: string) => string = (topicId) =>
    `route.${topicId}`,
): ResolvedHostPlan {
  const routes: DeliveryRoute[] = catalog.subscriptions.flatMap(
    (subscription) =>
      subscription.topics.map((topic) => ({
        topicId: topic.id,
        subscriptionId: subscription.id,
        routeId: routeIdFor(topic.id, subscription.id),
      })),
  );

  const manifest: MessagingManifest = {
    id: "test-deployment",
    carrier,
    topicIds: catalog.topics.map((t) => t.id),
    subscriptionIds: catalog.subscriptions.map((s) => s.id),
    routes,
    roles: [
      {
        id: TEST_ROLE_ID,
        publishesTo: catalog.topics.map((t) => t.id),
        consumesFrom: catalog.subscriptions.map((s) => s.id),
      },
    ],
  };

  assertManifest(catalog, manifest);
  return resolveHostPlan(hostPlanFor(manifest, TEST_ROLE_ID), catalog);
}
