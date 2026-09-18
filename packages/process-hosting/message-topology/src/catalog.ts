import type { Subscription, Topic } from "@lcase/ports";

/**
 * Every topic and logical subscription a product declares, independent of any
 * deployment that enables them or any process that hosts one.
 *
 * A catalog is the stable vocabulary: identities and the Message types each
 * carries. It says nothing about which carrier moves them, which physical
 * route they travel, or which process role consumes a subscription. A deployment
 * manifest answers all three by selecting from here.
 *
 * Closed under union, which is what makes one protocol's declarations a catalog
 * in their own right. `jobCatalog` is the job conversation's contribution and
 * happens to be the whole of it today only because it is the sole migrated
 * protocol. The dormant `worker.slot.*` protocol and the run and step families
 * still on `EventBusPort` merge in rather than replacing it, and
 * `assertDistinctTopics` is what makes that merge safe: two protocols reusing
 * one identity is the failure a union has to catch.
 *
 * Reaches a carrier only through `resolveHostPlan`, which joins it to one
 * role's plan. Nothing hands a whole catalog to a router: a catalog says what
 * every identity means, and a process needs that only for the conversations its
 * own role takes part in.
 */
export type MessageCatalog = {
  topics: readonly Topic[];
  subscriptions: readonly Subscription[];
};

export function assertDistinctTopics(topics: readonly Topic[]): void {
  const seen = new Set<string>();
  for (const topic of topics) {
    if (seen.has(topic.id)) {
      throw new Error(`[message-topology] duplicate topic id '${topic.id}'`);
    }
    seen.add(topic.id);
  }
}

/**
 * Every subscription must select declared topics, so the two lists describe one
 * graph rather than two that happen to overlap.
 *
 * The empty and duplicate checks are here as well as in the type, because a
 * catalog reaches its consumers through the erased `readonly Subscription[]`
 * form where the non-empty tuple no longer constrains it. Selecting the same
 * topic twice would otherwise register one delivery lane twice and deliver
 * every Message to it twice.
 */
export function assertDeclaredSubscriptions(catalog: MessageCatalog): void {
  const topicIds = new Set(catalog.topics.map((t) => t.id));
  const seenSubs = new Set<string>();
  for (const subscription of catalog.subscriptions) {
    if (seenSubs.has(subscription.id)) {
      throw new Error(
        `[message-topology] duplicate subscription id '${subscription.id}'`,
      );
    }
    seenSubs.add(subscription.id);

    if (subscription.topics.length === 0) {
      throw new Error(
        `[message-topology] subscription '${subscription.id}' selects no topics`,
      );
    }

    const selectedTopics = new Set<string>();
    for (const topic of subscription.topics) {
      if (selectedTopics.has(topic.id)) {
        throw new Error(
          `[message-topology] subscription '${subscription.id}' selects topic '${topic.id}' more than once`,
        );
      }
      selectedTopics.add(topic.id);
      if (!topicIds.has(topic.id)) {
        throw new Error(
          `[message-topology] subscription '${subscription.id}' references undeclared topic '${topic.id}'`,
        );
      }
    }
  }
}

/** Both declaration checks, for a catalog validated as a whole. */
export function assertCatalog(catalog: MessageCatalog): void {
  assertDistinctTopics(catalog.topics);
  assertDeclaredSubscriptions(catalog);
}
