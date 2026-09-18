import type { AnyEvent, EventType } from "@lcase/types";

/**
 * One Message per event type in `T`, as a complete envelope.
 *
 * The mapped form matters: `AnyEvent<"a" | "b">` distributes into a
 * discriminated union of two full envelopes, where a bare `AnyEvent` would
 * collapse the relationship between each type and its own `data` shape.
 */
export type MessageOf<T extends EventType> = {
  [K in T]: AnyEvent<K>;
}[T];

/**
 * The only messaging dependency a producer receives. Bound to exactly one
 * declared topic, so a component cannot route to an arbitrary
 * destination -- runtime decides where a topic goes, not its publisher.
 *
 * `publish()` resolves on *admission*: every destination accepted its own copy.
 * It does not mean a handler started, finished, or succeeded. A sender may
 * await infrastructure accepting a Message; it never awaits the recipient
 * processing it.
 *
 * Admission failure is still real failure -- callers must await this or attach
 * it to a task whose rejection is observed, never leave it as a bare Promise.
 */
export interface MessagePublisher<T extends EventType> {
  publish(message: MessageOf<T>): Promise<void>;
}
