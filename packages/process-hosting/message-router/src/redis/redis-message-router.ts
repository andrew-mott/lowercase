import type { AnyEvent, EventType } from "@lcase/types";
import type {
  Subscription,
  MessageBinding,
  MessageLogPort,
  MessageOf,
  MessagePublisher,
  Topic,
  SelectedTopics,
  SelectedTypes,
} from "@lcase/ports";
import {
  defaultReportFailure,
  type DeliveredMessage,
  type ReportDeliveryFailure,
} from "../delivery.types.js";
import { DeliveryLane } from "../delivery-lane.js";
import type { ResolvedHostPlan, TopicRoute } from "@lcase/message-topology";
import {
  assertPlanFullyBound,
  canonicalSubscriptionFor,
  plannedPublisherFor,
  type MessageRouter,
} from "../message-router.js";
import {
  DEFAULT_REDIS_KEY_PREFIX,
  redisGroupName,
  redisStreamKey,
} from "./redis-naming.js";

export type RedisMessageRouterConfig = {
  /**
   * This role's whole view of the deployment, resolved against the catalog this
   * process imported. Nested rather than spread, so deployment data and this
   * carrier's own knobs cannot collide.
   */
  plan: ResolvedHostPlan;
  /**
   * One connection per call. A blocking `XREADGROUP` occupies its connection
   * for the whole BLOCK window, so a read loop sharing a client with the
   * publisher would stall every `XADD` behind it.
   */
  createLog: () => Promise<MessageLogPort>;
  /** Namespaces every stream key, so a test run cannot collide with dev data. */
  keyPrefix?: string;
  consumerName?: string;
  /**
   * How many entries one `XREADGROUP` claims at a time, defaulting to the
   * binding's `maxInFlight`.
   *
   * Deliberately separate from that bound even though it defaults to it: they
   * answer different questions. `maxInFlight` is a component's promise about
   * how many handlers it runs at once, and Redis has no primitive for that, so
   * the lane enforces it. This decides how many entries move into this
   * consumer's pending list, which is a claim of responsibility rather than an
   * execution budget. Nothing reclaims a pending entry here, so claiming more
   * than the lane can work through only widens the window a crash loses.
   */
  readCount?: number;
  blockMs?: number;
  readFailureBackoffMs?: number;
  reportFailure?: ReportDeliveryFailure;
};

export interface RedisMessageRouter extends MessageRouter {
  /**
   * Provisions streams and consumer groups, then runs one read loop per bound
   * subscription. Nothing is delivered and nothing may be published until this
   * resolves.
   */
  start(): Promise<void>;
  /**
   * Stops intake and waits for in-flight handlers, then closes every
   * connection. Anything still queued in Redis is simply left unread -- this
   * is not a drain.
   */
  stop(): Promise<void>;
}

/**
 * One route's physical side of a subscription: the stream it reads, the topics
 * that route carries, the types they are allowed to carry between them, and its
 * own connection, because a blocking read occupies one.
 *
 * Per route rather than per selected topic. Several of a subscription's topics
 * can converge onto one route -- that convergence is what gives a shared
 * observation path its order -- and two readers on one stream under one group
 * and consumer name would split those entries between them, each rejecting what
 * the other was narrowed to.
 */
type BoundReader = {
  routeId: string;
  topicIds: readonly string[];
  stream: string;
  allowedTypes: ReadonlySet<EventType>;
  log?: MessageLogPort;
};

/**
 * One hosted subscription: one reader per route it reads, feeding one lane.
 *
 * The group name is the subscription id on every route's stream. A Redis
 * consumer group belongs to one stream, so that reuse gives each stream its own
 * independent group instance and cursor -- not a shared checkpoint, and not an
 * order across them. Order comes from topics converging onto one route, where
 * one log and one cursor carry them; the lane serializes what it is given and
 * does not create that order. What it does provide is that this process invokes
 * the handler for one delivery at a time up to `maxInFlight`, whichever stream
 * it arrived on.
 */
type BoundSubscription = {
  subscription: Subscription;
  lane: DeliveryLane;
  maxInFlight: number;
  readCount: number;
  group: string;
  readers: BoundReader[];
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The topics a subscription reads, collected by the route that carries them.
 *
 * Insertion-ordered, so a reader list follows the manifest's route order rather
 * than an arbitrary one -- the same reason `resolveHostPlan` keeps arrays.
 */
function groupByRoute(
  topicRoutes: readonly TopicRoute[],
): Map<string, string[]> {
  const byRoute = new Map<string, string[]>();
  for (const route of topicRoutes) {
    const topicIds = byRoute.get(route.routeId) ?? [];
    topicIds.push(route.topicId);
    byRoute.set(route.routeId, topicIds);
  }
  return byRoute;
}

/**
 * A log-backed carrier for the same declarations the in-process router
 * consumes, mapping them onto Redis Streams with nothing invented in between:
 * a delivery route is a stream, a logical subscription is a consumer group on
 * each route it reads, and a hosting process is one consumer within each group.
 * Fan-out across groups is what reproduces "every subscription independently
 * receives every Message"; load balancing within a group is what a second
 * hosting process would get.
 *
 * A topic is not a stream. One publication is appended to every route its topic
 * travels, as a single admission, so a deployment can give one subscription its
 * own path through the same conversation without the publisher knowing. Where
 * that path carries several topics, one log and one cursor carry them in the
 * order they were admitted -- which is the only ordering this carrier offers,
 * since no consumer group spans two streams.
 *
 * Delivery is deliberately at-most-once, matching the in-process mailbox
 * rather than exceeding it. Every entry is acknowledged once its handler
 * settles, success or failure, so a failed handler is reported and dropped
 * exactly as it is locally. Nothing is retried, nothing is reclaimed, and the
 * pending list stays transient. A process that dies mid-handler loses that
 * Message -- the same outcome the in-process carrier already has, which is
 * what makes swapping one for the other a swap rather than a change.
 */
export function createRedisMessageRouter(
  config: RedisMessageRouterConfig,
): RedisMessageRouter {
  // No declaration checks here. `resolveHostPlan` runs them once, where both
  // the plan and the catalog are in scope, rather than each carrier repeating
  // them on whatever it happens to be handed.
  const keyPrefix = config.keyPrefix ?? DEFAULT_REDIS_KEY_PREFIX;
  // Stable rather than per-boot: with every entry acknowledged there is no
  // pending backlog for a restarted process to inherit, so a fresh consumer
  // name per boot would only accumulate dead consumers in Redis.
  const consumerName = config.consumerName ?? "local";
  const blockMs = config.blockMs ?? 1_000;
  const readFailureBackoffMs = config.readFailureBackoffMs ?? 1_000;
  const reportFailure = config.reportFailure ?? defaultReportFailure;

  // Keyed by the route, never the topic -- which is why nothing below reaches
  // for a topic id to name one.
  const streamFor = (routeId: string): string =>
    redisStreamKey(keyPrefix, routeId);

  const bindings = new Map<string, BoundSubscription>();
  let sealed = false;
  let running = false;
  let publisherLog: MessageLogPort | undefined;
  let loops: Promise<void>[] = [];

  function report(
    subscriptionId: string,
    entryId: string,
    message: AnyEvent | null,
    error: unknown,
  ): void {
    try {
      reportFailure({
        subscriptionId,
        messageId: message?.id ?? entryId,
        messageType: message?.type ?? ("unknown" as EventType),
        source: message?.source ?? "unknown",
        error,
      });
    } catch {
      // A failing reporter must never take a read loop down with it.
    }
  }

  async function ack(
    bound: BoundSubscription,
    reader: BoundReader,
    entry: { id: string },
    decoded: AnyEvent | null,
  ): Promise<void> {
    try {
      await reader.log?.ack(reader.stream, bound.group, [entry.id]);
    } catch (error) {
      report(bound.subscription.id, entry.id, decoded, error);
    }
  }

  async function present(
    bound: BoundSubscription,
    reader: BoundReader,
    entry: { id: string; message: AnyEvent },
  ): Promise<void> {
    const decoded: AnyEvent | null = entry.message ?? null;

    // Nothing validated this envelope on the way in. The in-process router's
    // handler cast is sound only because publish() checked the type against
    // the topic first; off the wire that guarantee has to be
    // re-established here or the cast below is a lie.
    if (!decoded || !reader.allowedTypes.has(decoded.type)) {
      report(
        bound.subscription.id,
        entry.id,
        decoded,
        new Error(
          `[message-router] stream '${reader.stream}' carried '${String(
            decoded?.type,
          )}', which no topic on route '${reader.routeId}' declares; it carries [${reader.topicIds.join(", ")}]`,
        ),
      );
      // Acknowledged rather than left pending: it is not this subscription's
      // work and re-reading it forever would not make it so.
      await ack(bound, reader, entry, decoded);
      return;
    }

    // Resolves once the handler has settled and this entry is acknowledged.
    // Awaiting it is what keeps a reader from running ahead of the shared lane
    // -- concurrency is bounded by the lane, not by the batch.
    await bound.lane.enqueue({
      message: decoded as DeliveredMessage,
      retire: () => ack(bound, reader, entry, decoded),
    });
  }

  async function runReader(
    bound: BoundSubscription,
    reader: BoundReader,
  ): Promise<void> {
    const log = reader.log;
    if (!log) return;

    while (running) {
      let entries;
      try {
        entries = await log.readGroup(
          reader.stream,
          bound.group,
          consumerName,
          {
            batchSize: bound.readCount,
            blockMs,
          },
        );
      } catch (error) {
        // A connection dropped mid-shutdown is expected, not a fault.
        if (!running) return;
        report(bound.subscription.id, "", null, error);
        await sleep(readFailureBackoffMs);
        continue;
      }

      // The batch is awaited as a whole before the next read, so one slow
      // handler idles this reader. The in-process carrier refills
      // continuously; this is a throughput difference between the carriers,
      // not a semantic one.
      //
      // Each reader claims up to readCount, so a subscription selecting N
      // topics can hold up to N x readCount entries unacknowledged while
      // its lane works through them. That is the cost of reading several
      // streams, and it is why readCount is nameable separately from the
      // concurrency bound the lane enforces.
      await Promise.all(entries.map((entry) => present(bound, reader, entry)));
    }
  }

  return {
    bind<const Topics extends SelectedTopics>(
      binding: MessageBinding<Topics>,
    ): void {
      if (sealed) {
        throw new Error(
          `[message-router] cannot bind '${binding.subscription.id}' after seal()`,
        );
      }
      const { subscription, topicRoutes } = canonicalSubscriptionFor(
        config.plan,
        binding.subscription,
      );
      if (bindings.has(subscription.id)) {
        throw new Error(
          `[message-router] duplicate subscription id '${subscription.id}'`,
        );
      }

      const maxInFlight = binding.maxInFlight ?? 1;
      const readCount = config.readCount ?? maxInFlight;
      const declaredTypes = new Map(
        subscription.topics.map((topic) => [topic.id, topic.types]),
      );
      bindings.set(subscription.id, {
        subscription,
        group: redisGroupName(subscription.id),
        maxInFlight,
        readCount,
        lane: new DeliveryLane({
          subscriptionId: subscription.id,
          // Same contravariance as the in-process router: one cast on the
          // Message at invocation, sound because present() has just checked
          // the decoded type against that reader's declared list.
          invoke: (message) =>
            binding.handler(message as MessageOf<SelectedTypes<Topics>>),
          maxInFlight,
          reportFailure,
          // No idle bookkeeping here. whenIdle() is an in-process diagnostic
          // no log-backed carrier can answer honestly, so there is nothing
          // for a settled delivery to decrement.
          onSettled: () => {},
        }),
        // One reader per distinct route, not per selected topic. Topics that
        // converge onto one route share a reader, a group instance and a
        // cursor, which is what makes their relative order a property of the
        // log rather than of whichever local read finished first.
        //
        // A reader accepts the union of what its route's topics declare. That
        // is the right strength rather than a concession: the guard exists to
        // make the cast at delivery sound, and the handler is typed over the
        // union of everything this subscription selects.
        readers: [...groupByRoute(topicRoutes)].map(([routeId, topicIds]) => ({
          routeId,
          topicIds,
          stream: streamFor(routeId),
          // Present because `resolveHostPlan` proved the declared selection and
          // the routed set name the same topics.
          allowedTypes: new Set<EventType>(
            topicIds.flatMap((topicId) => [...declaredTypes.get(topicId)!]),
          ),
        })),
      });
    },

    seal(): void {
      if (sealed) throw new Error("[message-router] already sealed");
      assertPlanFullyBound(config.plan, new Set(bindings.keys()));
      sealed = true;
    },

    publisher<Types extends readonly EventType[]>(
      topic: Topic<Types>,
    ): MessagePublisher<Types[number]> {
      // A permission, and deliberately with no counterpart at seal(): a role
      // that never resolves a publisher it was allowed is fine, where a
      // subscription it never bound is not.
      const { topic: declared, routeIds } = plannedPublisherFor(
        config.plan,
        topic,
      );

      const allowedTypes = new Set<EventType>(declared.types);
      // Every route this topic travels, resolved once here rather than per
      // Message. A publisher still publishes once; how many destinations that
      // reaches is the deployment's business and not this component's.
      const streams = routeIds.map(streamFor);

      return {
        async publish(message) {
          if (!sealed) {
            throw new Error(
              `[message-router] cannot publish to '${declared.id}' before seal()`,
            );
          }
          // Unlike the in-process carrier there is no connection until
          // start(), so publishing early cannot silently reach nobody.
          if (!publisherLog) {
            throw new Error(
              `[message-router] cannot publish to '${declared.id}' before start()`,
            );
          }
          if (!allowedTypes.has(message.type)) {
            throw new Error(
              `[message-router] topic '${declared.id}' does not allow '${message.type}'`,
            );
          }

          // One admission across every route, so no consumer of one of them can
          // act on this Message -- and publish what it produced -- before the
          // others exist. Two sequential appends would permit exactly that
          // inversion even when both succeed.
          await publisherLog.publish(streams, message as AnyEvent);
        },
      };
    },

    async start(): Promise<void> {
      if (!sealed) {
        throw new Error("[message-router] cannot start() before seal()");
      }
      if (running) throw new Error("[message-router] already started");

      publisherLog = await config.createLog();
      // Only the routes this role publishes, where it used to be every topic in
      // the deployment. A route this role only reads needs no publisher to
      // create it: ensureConsumerGroup passes MKSTREAM, so the consumer
      // provisions its own stream.
      //
      // Distinct routes rather than one pass per topic: several of this role's
      // topics can converge onto one route, and provisioning it once per topic
      // would be repeating work whose only effect is to look like more.
      const publishedRoutes = new Set(
        config.plan.publishesTo.flatMap((planned) => planned.routeIds),
      );
      for (const routeId of publishedRoutes) {
        await publisherLog.ensureStream(streamFor(routeId));
      }

      // Every group exists before any loop runs and before publishing is
      // possible at all. A group created at `$` sees nothing published before
      // it existed, so provisioning has to complete up front rather than
      // lazily inside each loop. A subscription selecting several topics
      // provisions its group on each of their streams.
      for (const bound of bindings.values()) {
        for (const reader of bound.readers) {
          reader.log = await config.createLog();
          await reader.log.ensureConsumerGroup(reader.stream, bound.group, {
            startAt: "latest",
          });
        }
      }

      running = true;
      loops = [...bindings.values()].flatMap((bound) =>
        bound.readers.map((reader) => runReader(bound, reader)),
      );
    },

    async stop(): Promise<void> {
      if (!running) return;
      running = false;

      // Loops are awaited before anything closes: a blocking read returns
      // within one blockMs, and closing its connection underneath it would
      // turn an ordinary shutdown into a reported failure.
      await Promise.all(loops);
      loops = [];

      const logs = [
        publisherLog,
        ...[...bindings.values()].flatMap((b) => b.readers.map((r) => r.log)),
      ];
      publisherLog = undefined;
      for (const bound of bindings.values()) {
        for (const reader of bound.readers) reader.log = undefined;
      }

      await Promise.all(
        logs.map(async (log) => {
          try {
            await log?.close();
          } catch (error) {
            report("router", "", null, error);
          }
        }),
      );
    },
  };
}
