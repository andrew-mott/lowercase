import type { Subscription, Topic } from "@lcase/ports";
import type { MessageCatalog } from "../catalog.js";
import { defineTopicFor, defineSubscription } from "../define-topic.js";

/**
 * The Worker-Engine job conversation, declared as delivery purposes rather than
 * transport. Nothing here names a mailbox, a Redis stream key, a consumer
 * name, or an acknowledgement -- a log-backed carrier consumes these same
 * declarations.
 *
 * The conversation is jobs, not one capability. `httpjson` is the only
 * protocol its Message types name today, and an `mcp` job belongs on these
 * same topics rather than on a parallel set. The type unions are what keep
 * that honest: `defineTopicFor` proves each list covers its union exactly, so
 * adding a type to `JobCommandType` without listing it on the topic fails to
 * compile rather than silently never being published.
 */
export type JobCommandType = "job.httpjson.submitted";
export type JobTerminalType = "job.httpjson.completed" | "job.httpjson.failed";

export const jobCommandTopic = defineTopicFor<JobCommandType>()({
  id: "job-command.v1",
  types: ["job.httpjson.submitted"],
});

export const jobTerminalTopic = defineTopicFor<JobTerminalType>()({
  id: "job-terminal.v1",
  types: ["job.httpjson.completed", "job.httpjson.failed"],
});

// Three independent subscriptions, each with its own delivery lane.
// Observability holds one of its own across both topics rather than receiving a
// privileged wildcard copy, which makes it a peer subscriber instead of a
// special case.
//
// It is one subscription rather than two because recording a Worker job is one
// purpose, not two that happen to be adjacent. Two would give it two lanes, and
// a terminal could then start while the command that produced it was still
// being recorded.
//
// No wildcard subscription, and deliberately no Limiter subscription: the
// limiter listens only to the dormant worker.slot.* protocol today, and worker
// already owns live local capacity and per-resource permits.
export const workerJobCommandSubscription = defineSubscription({
  id: "worker.job-command.v1",
  topics: [jobCommandTopic],
});

export const engineJobTerminalSubscription = defineSubscription({
  id: "engine.job-terminal.v1",
  topics: [jobTerminalTopic],
});

export const observabilityJobSubscription = defineSubscription({
  id: "observability.job.v1",
  topics: [jobCommandTopic, jobTerminalTopic],
});

// The declaration a router is handed, and the one place the graph is stated
// in full. A carrier reads it for more than validation: a log-backed one
// provisions a stream per topic, and a consumer group per subscription on
// each stream that subscription selects, straight from these lists.
export const jobTopics: readonly Topic[] = [jobCommandTopic, jobTerminalTopic];

export const jobSubscriptions: readonly Subscription[] = [
  workerJobCommandSubscription,
  engineJobTerminalSubscription,
  observabilityJobSubscription,
];

// The same graph as one value, which is what a deployment manifest is
// validated against. Kept alongside the two lists rather than replacing them
// because a carrier still takes them separately.
export const jobCatalog: MessageCatalog = {
  topics: jobTopics,
  subscriptions: jobSubscriptions,
};
