import type { Subscription, Topic } from "@lcase/ports";
import { assertCatalog, type MessageCatalog } from "./catalog.js";
import type { MessagingHostPlan } from "./host-plan.js";
import type { MessagingCarrierKind, TopicRoute } from "./manifest.js";

/**
 * A planned publisher with its identity resolved to the declaration that says
 * what the topic actually carries.
 *
 * The topic object rather than its ID, because the Message types are the half a
 * plan cannot hold: a carrier refuses a foreign Message by checking
 * `topic.types`, and that check is what makes its one unavoidable cast sound.
 */
export type ResolvedPublisher = {
  topic: Topic;
  routeIds: readonly string[];
};

/**
 * A planned subscription with its identity resolved to the declaration that
 * says which topics it selects.
 *
 * Keeps `topicRoutes` beside the declaration rather than folding routes into
 * it. The declaration is the product's, shared by every deployment; the routes
 * are this deployment's, and a log-backed carrier needs both to know which
 * stream to read and which topic's Messages arrive on it.
 */
export type ResolvedSubscription = {
  subscription: Subscription;
  topicRoutes: readonly TopicRoute[];
};

/**
 * A host plan joined to the protocol declarations this process imported.
 *
 * The first shape a carrier can actually execute. `MessagingHostPlan` answers
 * what this role may publish and must consume and where those Messages travel;
 * `MessageCatalog` answers what each identity means. Neither replaces the
 * other, and `assertManifest` does not merge them -- it proves a manifest
 * agrees with a catalog without copying anything out of it.
 *
 * Mirrors `MessagingHostPlan` field for field with the declaration swapped in
 * where the ID was, so `Planned` and `Resolved` name the one thing that differs
 * between them. Reading a plan and its resolved form side by side should not
 * need a translation step.
 */
export type ResolvedHostPlan = {
  manifestId: string;
  roleId: string;
  carrier: MessagingCarrierKind;
  publishesTo: readonly ResolvedPublisher[];
  consumesFrom: readonly ResolvedSubscription[];
};

// A function declaration rather than `assert-manifest.ts`'s const arrow, so
// that its `never` return narrows the lookups below and the resolved objects
// need no non-null assertion.
function err(message: string): never {
  throw new Error(`[message-topology] ${message}`);
}

/**
 * Joins one role's plan to the declarations this process holds.
 *
 * Carrier-neutral on purpose, and performed once rather than inside each
 * carrier: both carriers need the same join, and a join that lives in two
 * places drifts.
 *
 * Deliberately one-directional. Every planned identity must resolve, because a
 * plan is what this deployment assigned to this role; a catalog holding more
 * than the plan names is a host that imported conversations it takes no part
 * in, which is over-supply rather than a mistake.
 *
 * That first direction is the error worth having. A host assigned a
 * subscription whose protocol module it forgot to import fails here, naming the
 * missing declaration -- where today the same mistake surfaces much later at
 * `seal()` as a subscription nobody bound, which points at wiring instead.
 */
export function resolveHostPlan(
  plan: MessagingHostPlan,
  catalog: MessageCatalog,
): ResolvedHostPlan {
  assertCatalog(catalog);

  const at = `role '${plan.roleId}' of manifest '${plan.manifestId}'`;
  const topicsById = new Map(catalog.topics.map((t) => [t.id, t]));
  const subscriptionsById = new Map(
    catalog.subscriptions.map((s) => [s.id, s]),
  );

  const publishesTo = plan.publishesTo.map((planned): ResolvedPublisher => {
    const topic = topicsById.get(planned.topicId);
    if (!topic) {
      err(
        `${at} may publish topic '${planned.topicId}', which this process's catalog does not declare`,
      );
    }
    return { topic, routeIds: planned.routeIds };
  });

  const consumesFrom = plan.consumesFrom.map(
    (planned): ResolvedSubscription => {
      const subscription = subscriptionsById.get(planned.subscriptionId);
      if (!subscription) {
        err(
          `${at} consumes subscription '${planned.subscriptionId}', which this process's catalog does not declare`,
        );
      }

      // The declaration and the deployment have to agree on what this
      // subscription spans. They are authored in different files by different
      // concerns, so a topic added to a subscription without adding its
      // delivery edge would otherwise produce a consumer that reads every
      // route it was given and silently never sees the new topic.
      //
      // Compared as sets: a route list is ordered by the manifest and a
      // selection by the declaration, and neither order means anything.
      const declared = new Set(subscription.topics.map((t) => t.id));
      const routed = new Set(planned.topicRoutes.map((r) => r.topicId));
      const disagrees =
        declared.size !== routed.size ||
        [...declared].some((id) => !routed.has(id));
      if (disagrees) {
        err(
          `${at} routes subscription '${planned.subscriptionId}' for [${[...routed].join(", ")}], but it is declared as selecting [${[...declared].join(", ")}]`,
        );
      }

      return { subscription, topicRoutes: planned.topicRoutes };
    },
  );

  return {
    manifestId: plan.manifestId,
    roleId: plan.roleId,
    carrier: plan.carrier,
    publishesTo,
    consumesFrom,
  };
}
