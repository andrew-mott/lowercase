import type { EventType } from "@lcase/types";
import type { MessageHandler } from "./message-handler.js";

/**
 * A declared route a producer is allowed to publish onto, and the exact list of
 * Message types it accepts. Runtime owns these values; components receive only
 * a publisher already bound to one of them.
 *
 * Parameterised on the *list* rather than on the union it forms, so the union
 * is derived from the declared value instead of being asserted alongside it.
 * A `types: readonly T[]` shape would only require each element to be a member
 * of `T` -- never that the list covers `T` -- so a topic could promise
 * more at compile time than it accepted at runtime. Build these with
 * `defineTopic`/`defineTopicFor` rather than annotating by hand.
 */
export type Topic<Types extends readonly EventType[] = readonly EventType[]> = {
  id: string;
  types: Types;
};

/** The union of Message types a topic carries. */
export type TopicTypes<P extends Topic> = P["types"][number];

/**
 * Requires `Listed` to cover every member of `All`.
 *
 * Resolves to `unknown` (a no-op in an intersection) when the list is
 * complete, and otherwise to an object carrying the missing members, so the
 * compiler error names exactly what was left out.
 */
export type CompleteList<
  All extends EventType,
  Listed extends readonly All[],
> = [Exclude<All, Listed[number]>] extends [never]
  ? unknown
  : { readonly __missingEventTypes__: Exclude<All, Listed[number]> };

/** A topic selection: at least one, so a subscription can never select nothing. */
export type SelectedTopics = readonly [Topic, ...Topic[]];

/**
 * A stable delivery purpose selecting one or more explicit topics -- each
 * logical subscription independently receives every Message published to any of
 * them, through one delivery lane.
 *
 * Several topics rather than one because a subscription is a *consumption
 * purpose*, not a mirror of a producer's route. Observability's interest in a
 * Worker job is one purpose spanning the command and its terminal outcomes; two
 * subscriptions would give it two independent lanes and let a terminal overtake
 * a blocked command.
 *
 * The id names durable topology, not one process boot or one handler instance,
 * so it can map to a local lane or a Redis consumer group without changing what
 * it means. A log-backed carrier provisions that one group name on each selected
 * topic's stream; the group is per stream, so reusing the name does not
 * create a cross-stream checkpoint or a total order between them.
 *
 * Declare these with `defineSubscription` rather than annotating by hand, so the
 * tuple is inferred and the handler union is derived from the selection itself.
 */
export type Subscription<Topics extends SelectedTopics = SelectedTopics> = {
  id: string;
  topics: Topics;
};

/**
 * The union of Message types a subscription's selected topics carry, and
 * therefore exactly what its handler must accept.
 */
export type SelectedTypes<Topics extends readonly Topic[]> = TopicTypes<
  Topics[number]
>;

/**
 * One hosted subscription: the purpose plus the handler this process runs for
 * it. `maxInFlight` bounds how many of that subscription's handlers may be
 * running at once, defaulting to 1 (FIFO starts and completions).
 *
 * The bound is per subscription, not per selected topic: one binding owns
 * one lane, which is what lets `maxInFlight: 1` settle the order of Messages
 * arriving from different topics. It is also not shared across a
 * component's several subscriptions -- a component-wide capacity group is a
 * later feature, and naming one here would imply serialization this does not
 * provide.
 */
export type MessageBinding<Topics extends SelectedTopics = SelectedTopics> = {
  subscription: Subscription<Topics>;
  handler: MessageHandler<SelectedTypes<Topics>>;
  maxInFlight?: number;
};
