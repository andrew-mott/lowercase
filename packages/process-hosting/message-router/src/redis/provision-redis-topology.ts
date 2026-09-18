import type { MessageLogPort } from "@lcase/ports";
import type { MessagingManifest } from "@lcase/message-topology";
import {
  DEFAULT_REDIS_KEY_PREFIX,
  redisGroupName,
  redisStreamKey,
} from "./redis-naming.js";

export type ProvisionRedisTopologyOptions = {
  /** The whole deployment, not one role's plan: every route and every group. */
  manifest: MessagingManifest;
  /** Left open afterwards. The caller opened the connection and closes it. */
  log: MessageLogPort;
  /** Must match what the deployment's hosts use. */
  keyPrefix?: string;
};

export type ProvisionedRedisTopology = {
  streams: string[];
  groups: { stream: string; group: string }[];
};

/**
 * Creates every stream and consumer group a Redis deployment reads, before any
 * host starts.
 *
 * Hosts create their own groups on start, but only for the subscriptions they
 * host, and at `$` -- the end of the stream. A group created after a Message was
 * appended never sees it, so when a publisher starts first, its earliest
 * Messages are skipped by a consumer that arrives later. Creating every group
 * from the manifest before anything publishes makes `$` and the beginning of
 * the stream the same point, so arrival order stops mattering and nothing is
 * replayed either.
 *
 * Creation only. A group that exists keeps its cursor, so running this again,
 * or for several deployments sharing one Redis, changes nothing. It never
 * removes a group or stream the manifest no longer names.
 *
 * Validating the manifest needs the catalog, which this carrier does not
 * import; the caller does that first.
 */
export async function provisionRedisTopology(
  options: ProvisionRedisTopologyOptions,
): Promise<ProvisionedRedisTopology> {
  const { manifest, log } = options;
  if (manifest.carrier !== "redis-streams") {
    throw new Error(
      `[message-router] manifest '${manifest.id}' is carried by '${manifest.carrier}', so there is no Redis topology to provision`,
    );
  }
  const keyPrefix = options.keyPrefix ?? DEFAULT_REDIS_KEY_PREFIX;

  const streams: string[] = [];
  const groups: { stream: string; group: string }[] = [];
  const seen = new Set<string>();

  // One group per distinct route and subscription. Several topics can converge
  // onto one route for the same subscription, which lists that pair once per
  // topic. No separate stream creation: every route in a valid manifest has a
  // subscription, and creating its group creates the stream.
  for (const route of manifest.routes) {
    const stream = redisStreamKey(keyPrefix, route.routeId);
    const group = redisGroupName(route.subscriptionId);
    const pair = `${stream}|${group}`;
    if (seen.has(pair)) continue;
    seen.add(pair);

    await log.ensureConsumerGroup(stream, group, { startAt: "latest" });
    if (!streams.includes(stream)) streams.push(stream);
    groups.push({ stream, group });
  }

  return { streams, groups };
}
