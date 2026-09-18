import type { EventType } from "@lcase/types";
import type {
  CompleteList,
  Subscription,
  Topic,
  SelectedTopics,
} from "@lcase/ports";

/**
 * Declares a topic whose list of Message types *is* its contract.
 *
 * The `const` type parameter keeps the literals from widening to `string[]`,
 * so the resulting `Topic` carries the exact tuple and every consumer --
 * publishers, handler signatures -- derives its union from that one value.
 * Nothing can drift, because there is no second declaration to drift from.
 *
 * Lives here rather than in `packages/ports` because ports is types-only, and
 * outside `@lcase/message-router` because declaring topology is not hosting
 * it: every carrier consumes these same declarations, and a deployment
 * describes them without running one.
 */
export function defineTopic<const Types extends readonly EventType[]>(
  topic: Topic<Types>,
): Topic<Types> {
  return topic;
}

/**
 * Declares a topic against an already-authoritative union, requiring the
 * list to cover it exactly.
 *
 * Use this when the union is the contract and the topic must implement
 * it -- the named union can then be shared with handler and publisher
 * signatures, so one rename moves everything together. Omitting a member fails
 * with an error naming the missing type; including a type outside the union
 * fails on the offending element.
 *
 * Curried because TypeScript cannot partially infer type arguments: `All` is
 * supplied explicitly while `Listed` is still inferred from the value.
 */
export function defineTopicFor<All extends EventType>() {
  return <const Listed extends readonly All[]>(
    topic: {
      readonly id: string;
      readonly types: Listed;
    } & CompleteList<All, Listed>,
  ): Topic<Listed> => topic;
}

/**
 * Declares a logical subscription over the topics it selects.
 *
 * The `const` type parameter keeps the selection from widening to
 * `Topic[]`, so the handler's Message union is derived from this one
 * value rather than restated beside it. Annotating a subscription by hand
 * instead means naming the topic tuple explicitly, which is both noisy
 * and a second place for the union to drift from.
 *
 * Selecting at least one topic is a compile error to omit, so an empty
 * subscription cannot reach the runtime check that also forbids it.
 */
export function defineSubscription<const Topics extends SelectedTopics>(
  subscription: Subscription<Topics>,
): Subscription<Topics> {
  return subscription;
}
