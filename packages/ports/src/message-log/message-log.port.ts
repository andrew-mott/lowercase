import type { AnyEvent } from "@lcase/types";

export type MessageLogEntry = { id: string; message: AnyEvent };

export type ReadGroupOptions = { batchSize: number; blockMs: number };
export type ClaimPendingOptions = { minIdleMs: number; count?: number };
export type ConsumerGroupOptions = { startAt: "beginning" | "latest" };

// A durable, ordered, multi-consumer-group message log -- not a queue
// (there's no single claim/reserve owner) and not a byte/chunk stream (see
// StreamPort for that). Deliberately technology-neutral: Redis Streams is
// the first adapter, but the shape doesn't assume it -- Kafka, NATS
// JetStream, and RabbitMQ Streams all fit the same publish + durable
// consumer-group-read + ack + pending-recovery primitive. Payload is
// AnyEvent, matching EventBusPort, since one shared envelope carries every
// message this system produces (commands included, once those exist). See
// docs/initiatives/swappable-infrastructure/arcs/queue-adapter.md's the related change
// discussion for the full reasoning.
export interface MessageLogPort {
  ensureStream(stream: string): Promise<void>;
  ensureConsumerGroup(
    stream: string,
    group: string,
    options: ConsumerGroupOptions,
  ): Promise<void>;
  /**
   * Appends one message to every named stream as a single admission, returning
   * the entry id it received on each, in order.
   *
   * The guarantee is non-interleaving: no other client may observe one of these
   * appends without the others. That is what lets one publication reach several
   * destinations without a consumer of the first acting on it -- and publishing
   * something derived from it -- before the rest exist.
   *
   * Deliberately not rollback. A log append has no failure mode worth undoing,
   * and promising atomicity in that sense would claim more than Redis
   * transactions, Kafka, or JetStream actually offer. An implementation that
   * cannot deliver non-interleaving across several streams should reject more
   * than one rather than append them in sequence.
   */
  publish(streams: readonly string[], message: AnyEvent): Promise<string[]>;
  readGroup(
    stream: string,
    group: string,
    consumer: string,
    options: ReadGroupOptions,
  ): Promise<MessageLogEntry[]>;
  ack(stream: string, group: string, ids: string[]): Promise<void>;
  claimPending(
    stream: string,
    group: string,
    consumer: string,
    options: ClaimPendingOptions,
  ): Promise<MessageLogEntry[]>;
  close(): Promise<void>;
}
