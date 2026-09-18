/**
 * How deployment identities become Redis keys.
 *
 * Its own module because more than the router depends on it. Anything that
 * creates streams or groups ahead of a host -- provisioning a deployment before
 * either host starts -- has to arrive at exactly the names the host will read,
 * and restating the rules there would let the two drift with nothing to catch
 * it but a Message that silently never arrives.
 */

/** Namespaces every stream key when a process configures no prefix. */
export const DEFAULT_REDIS_KEY_PREFIX = "lcase:";

/**
 * The stream carrying one delivery route.
 *
 * Keyed by the route, never the topic. A topic can travel several routes and
 * several topics can share one, so a stream is a physical path through a
 * deployment rather than a conversation.
 */
export function redisStreamKey(keyPrefix: string, routeId: string): string {
  return `${keyPrefix}${routeId}`;
}

/**
 * The consumer group a subscription reads through, on every route's stream.
 *
 * Only the subscription ID, and deliberately unprefixed: a group already lives
 * inside one stream, whose key carries the prefix. A Redis consumer group
 * belongs to one stream, so reusing the name gives each stream its own group
 * instance and cursor rather than a shared checkpoint.
 */
export function redisGroupName(subscriptionId: string): string {
  return subscriptionId;
}
