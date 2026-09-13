import {
  jobCommandTopic,
  jobTerminalTopic,
  workerJobCommandSubscription,
  engineJobTerminalSubscription,
  observabilityJobSubscription,
} from "../catalogs/job.catalog.js";
import type {
  DeliveryRoute,
  MessagingManifest,
  MessagingRole,
} from "../manifest.js";

/**
 * The complete embedded deployment: one role hosting the whole job
 * conversation.
 *
 * It is still a deployment with a role rather than a special case without one.
 * The embedded graph is what a single-role manifest looks like, which is what
 * keeps the split deployments from being a different kind of thing.
 *
 * This preset cannot prove how many OS processes an operator launched. It
 * describes one role hosting everything; running two copies of it is an
 * operational mistake that topology data has no way to see.
 */
export const localSystemRole: MessagingRole = {
  id: "local-system",
  publishesTo: [jobCommandTopic.id, jobTerminalTopic.id],
  consumesFrom: [
    workerJobCommandSubscription.id,
    engineJobTerminalSubscription.id,
    observabilityJobSubscription.id,
  ],
};

/**
 * Three routes over two topics: each topic's work path, and one observation
 * path both topics converge onto.
 *
 * The convergence is the whole of C23. Observability is an ordinary
 * subscription and stays one; what makes its Redis realization ordered is that
 * both of its delivery edges name the same route, so one log carries the
 * command and the terminal it produced in the order they were admitted.
 * Nothing here says "observability" to a carrier -- a carrier sees two edges
 * sharing a route ID and nothing more.
 *
 * No route ID equals a topic ID, deliberately. While they were equal, carrier
 * code that reached for a topic ID where it meant a route ID would have passed
 * every test by coincidence; keeping them distinct everywhere is what actually
 * exercises the difference between what a Message is and where it travels.
 *
 * These strings are this deployment's, not the product's. Another manifest over
 * the same catalog is free to route the same conversation differently, which is
 * why they are written out here rather than shared with the other presets.
 */
const routes: readonly DeliveryRoute[] = [
  {
    topicId: jobCommandTopic.id,
    subscriptionId: workerJobCommandSubscription.id,
    routeId: "job.command-work.v1",
  },
  {
    topicId: jobCommandTopic.id,
    subscriptionId: observabilityJobSubscription.id,
    routeId: "job.observation.v1",
  },
  {
    topicId: jobTerminalTopic.id,
    subscriptionId: engineJobTerminalSubscription.id,
    routeId: "job.terminal-work.v1",
  },
  {
    topicId: jobTerminalTopic.id,
    subscriptionId: observabilityJobSubscription.id,
    routeId: "job.observation.v1",
  },
];

const base = {
  topicIds: [jobCommandTopic.id, jobTerminalTopic.id],
  subscriptionIds: [
    workerJobCommandSubscription.id,
    engineJobTerminalSubscription.id,
    observabilityJobSubscription.id,
  ],
  routes,
  roles: [localSystemRole],
} as const;

/**
 * Two presets over one role and route base, because the carrier is a property
 * of the deployment rather than of the process.
 *
 * Running the embedded graph over Redis genuinely is a different deployment:
 * same roles, same logical conversation, different infrastructure to stand up.
 * The alternative -- one manifest with the carrier left out -- would mean the
 * manifest could not answer the one question every host has to agree on.
 */
export const localSystemInProcess: MessagingManifest = {
  ...base,
  id: "local-system-in-process",
  carrier: "in-process",
};

export const localSystemRedis: MessagingManifest = {
  ...base,
  id: "local-system-redis",
  carrier: "redis-streams",
};
