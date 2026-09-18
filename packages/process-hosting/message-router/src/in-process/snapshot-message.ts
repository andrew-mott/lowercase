import type { EventType } from "@lcase/types";
import type { MessageOf } from "@lcase/ports";

// Cycle-safe: structuredClone preserves cycles, so a naive recursive freeze
// would not terminate on one.
function deepFreeze(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
}

/**
 * The one place that decides what a delivered copy of a Message is.
 *
 * Every destination gets its own independently cloned, deeply frozen value.
 * The cloning is not only mutation safety: independent copies are what make
 * local delivery match a log-backed carrier, where each consumer decodes its
 * own copy and object identity is never shared. Recipients therefore cannot
 * observe each other's mutations or the publisher's object, and identity is
 * explicitly not part of the protocol.
 *
 * This is NOT wire-safety, and must not be mistaken for it. `structuredClone`
 * happily preserves `Date`, `Map`, `Set`, `BigInt`, `undefined` properties, and
 * cycles -- all of which JSON drops, coerces, or rejects. A Message can pass
 * `buildEvent()`'s schema validation, pass this seam, work perfectly in
 * process, and still change or fail the first time it crosses a real wire.
 * Closing that gap is a strict lossless-JSON codec that replaces this function
 * without publishers, handlers, or topology noticing -- which is the entire
 * reason snapshotting is isolated here rather than inlined into the router.
 */
export function snapshotMessage<T extends MessageOf<EventType>>(message: T): T {
  const copy = structuredClone(message);
  deepFreeze(copy, new WeakSet());
  return copy;
}
