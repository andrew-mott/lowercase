import type { EventType } from "@lcase/types";
import type {
  Subscription,
  MessageBinding,
  MessagePublisher,
  Topic,
  SelectedTopics,
} from "@lcase/ports";
import type {
  ResolvedHostPlan,
  ResolvedPublisher,
  ResolvedSubscription,
} from "@lcase/message-topology";

/**
 * What composition needs from a carrier, and the whole of it.
 *
 * Both carriers run the same phases -- declare, resolve publishers, bind,
 * seal -- because the graph is cyclic either way: worker's handler needs the
 * terminal publisher the router hands out, while the router needs worker's
 * handler to route to.
 *
 * Lifecycle is deliberately absent. An in-process router genuinely has
 * nothing to start, while a log-backed one must run read loops, and
 * `managedResource()` already normalizes exactly that difference without
 * either class pretending to the other's shape. `whenIdle()` is likewise
 * absent: it is an in-process diagnostic that no remote carrier can answer
 * honestly.
 */
export interface MessageRouter {
  /**
   * Resolvable before binding: the returned publisher looks its destinations
   * up when it publishes, not when it is created.
   */
  publisher<Types extends readonly EventType[]>(
    topic: Topic<Types>,
  ): MessagePublisher<Types[number]>;
  bind<const Topics extends SelectedTopics>(
    binding: MessageBinding<Topics>,
  ): void;
  seal(): void;
}

/**
 * Whether this role may publish the topic at all, and the declaration that says
 * what it carries.
 *
 * A permission check rather than a declaration lookup. The plan is what a
 * deployment assigned to this process, so a topic missing from it is one
 * another role owns -- a wiring mistake with a different cause than an
 * identity nobody declared, which `resolveHostPlan` has already ruled out.
 *
 * Scanned rather than indexed: a role publishes a handful of topics and
 * resolves each once at composition, never per Message.
 */
export function plannedPublisherFor(
  plan: ResolvedHostPlan,
  topic: Topic,
): ResolvedPublisher {
  const planned = plan.publishesTo.find((p) => p.topic.id === topic.id);
  if (!planned) {
    const permitted = plan.publishesTo.map((p) => p.topic.id).join(", ");
    throw new Error(
      `[message-router] role '${plan.roleId}' may not publish topic '${topic.id}'; it may publish [${permitted}]`,
    );
  }
  return planned;
}

/**
 * Resolves the binding's subscription to the one this role was assigned.
 *
 * Both carriers used to authorize a binding by id and then read its routing off
 * the object the caller handed in, so a same-id object selecting somewhere else
 * routed somewhere else. The plan is the authority on what an id means, so
 * routing comes from it and a disagreeing copy is refused rather than quietly
 * honoured.
 *
 * The selection and the Message types are both compared, because both decide
 * what a handler receives: a same-id topic declaring a wider type list would
 * otherwise widen what a lane accepts, and the one cast each carrier makes on
 * delivery is sound only because the declared list is the authority.
 */
export function canonicalSubscriptionFor(
  plan: ResolvedHostPlan,
  subscription: Subscription,
): ResolvedSubscription {
  const planned = plan.consumesFrom.find(
    (s) => s.subscription.id === subscription.id,
  );
  if (!planned) {
    const assigned = plan.consumesFrom.map((s) => s.subscription.id).join(", ");
    throw new Error(
      `[message-router] subscription '${subscription.id}' is not assigned to role '${plan.roleId}'; it consumes [${assigned}]`,
    );
  }

  const asked = subscription.topics.map((p) => p.id).join(", ");
  const known = planned.subscription.topics.map((p) => p.id).join(", ");
  if (asked !== known) {
    throw new Error(
      `[message-router] subscription '${subscription.id}' selects [${asked}], but this role's plan declares it as [${known}]`,
    );
  }

  for (const topic of subscription.topics) {
    const declared = planned.subscription.topics.find(
      (t) => t.id === topic.id,
    )!;
    const askedTypes = [...topic.types].join(", ");
    const knownTypes = [...declared.types].join(", ");
    if (askedTypes !== knownTypes) {
      throw new Error(
        `[message-router] subscription '${subscription.id}' selects topic '${topic.id}' carrying [${askedTypes}], but it is declared as carrying [${knownTypes}]`,
      );
    }
  }

  return planned;
}

/**
 * The completeness check `seal()` runs, shared so both carriers refuse the same
 * plans. Kept separate from binding so the message names what is missing rather
 * than where it was noticed.
 *
 * Only one direction is checked here, and that is the whole of exact equality:
 * a binding this role was not assigned cannot reach seal, because
 * `canonicalSubscriptionFor` refuses it at bind. What is left is a subscription
 * this process is responsible for and nobody wired, which nothing earlier can
 * see.
 *
 * A topic no subscription consumes used to fail here too. It cannot once roles
 * split -- a Worker host publishes terminals and consumes none of them -- so
 * `assertManifest` makes that claim about the whole deployment instead.
 */
export function assertPlanFullyBound(
  plan: ResolvedHostPlan,
  boundSubscriptionIds: ReadonlySet<string>,
): void {
  for (const planned of plan.consumesFrom) {
    if (!boundSubscriptionIds.has(planned.subscription.id)) {
      throw new Error(
        `[message-router] subscription '${planned.subscription.id}' is assigned to role '${plan.roleId}' but was never bound`,
      );
    }
  }
}
