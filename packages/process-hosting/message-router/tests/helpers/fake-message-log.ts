import type {
  ClaimPendingOptions,
  ConsumerGroupOptions,
  MessageLogEntry,
  MessageLogPort,
  ReadGroupOptions,
} from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";

type Group = { cursor: number; pending: Set<string> };

/**
 * The Redis Streams semantics the router actually depends on, in memory: an
 * append-only log per stream, an independent cursor and pending set per
 * consumer group, and a blocking read that returns empty rather than waiting
 * forever.
 *
 * Shared state lives on the store so several logs can be handed out from one
 * `createLog()` and still see each other -- which is what the real carrier
 * gets from all of them talking to the same Redis.
 */
export function createFakeMessageLogStore() {
  const streams = new Map<string, MessageLogEntry[]>();
  const groups = new Map<string, Group>();
  const provisionedStreams: string[] = [];
  const provisionedGroups: string[] = [];
  /** The streams named by each publish call, one entry per admission. */
  const admissions: string[][] = [];
  const acked: string[] = [];
  const closed: number[] = [];
  let sequence = 0;
  let logCount = 0;

  const key = (stream: string, group: string): string => `${stream}|${group}`;

  function createLog(): MessageLogPort {
    const index = logCount++;
    return {
      async ensureStream(stream) {
        provisionedStreams.push(stream);
        if (!streams.has(stream)) streams.set(stream, []);
      },
      async ensureConsumerGroup(
        stream: string,
        group: string,
        options: ConsumerGroupOptions,
      ) {
        provisionedGroups.push(key(stream, group));
        if (!streams.has(stream)) streams.set(stream, []);
        if (!groups.has(key(stream, group))) {
          groups.set(key(stream, group), {
            // "latest" starts at the end of the log, so a group created after
            // a Message was written never sees it -- the reason provisioning
            // has to finish before anything publishes.
            cursor:
              options.startAt === "beginning"
                ? 0
                : (streams.get(stream)?.length ?? 0),
            pending: new Set(),
          });
        }
      },
      async publish(targets: readonly string[], message: AnyEvent) {
        // Recorded per call rather than per stream, so a test can tell one
        // admission across two routes from two separate publications. That is
        // the only part of the real transaction a fake can speak to: appends
        // here cannot interleave because nothing else runs between them, which
        // makes the guarantee true and unproven.
        admissions.push([...targets]);
        return targets.map((stream) => {
          const id = `${++sequence}-0`;
          if (!streams.has(stream)) streams.set(stream, []);
          // Round-tripped through JSON like the real adapter, so a test cannot
          // accidentally assert on object identity the wire could never keep.
          streams
            .get(stream)!
            .push({ id, message: JSON.parse(JSON.stringify(message)) });
          return id;
        });
      },
      async readGroup(
        stream: string,
        group: string,
        _consumer: string,
        options: ReadGroupOptions,
      ) {
        const state = groups.get(key(stream, group));
        const entries = streams.get(stream) ?? [];
        if (!state || state.cursor >= entries.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(options.blockMs, 5)),
          );
          return [];
        }
        const batch = entries.slice(
          state.cursor,
          state.cursor + options.batchSize,
        );
        state.cursor += batch.length;
        for (const entry of batch) state.pending.add(entry.id);
        return batch;
      },
      async ack(stream: string, group: string, ids: string[]) {
        const state = groups.get(key(stream, group));
        for (const id of ids) {
          acked.push(`${key(stream, group)}|${id}`);
          state?.pending.delete(id);
        }
      },
      async claimPending(
        _stream: string,
        _group: string,
        _consumer: string,
        _options: ClaimPendingOptions,
      ) {
        // Never called: the router deliberately does not reclaim.
        return [];
      },
      async close() {
        closed.push(index);
      },
    };
  }

  return {
    createLog: async (): Promise<MessageLogPort> => createLog(),
    streams,
    provisionedStreams,
    provisionedGroups,
    admissions,
    acked,
    closed,
    pendingFor: (stream: string, group: string): string[] => [
      ...(groups.get(key(stream, group))?.pending ?? []),
    ],
    /** Writes straight to the log, bypassing the router's own type check. */
    inject: (stream: string, message: unknown): void => {
      const id = `${++sequence}-0`;
      if (!streams.has(stream)) streams.set(stream, []);
      streams.get(stream)!.push({ id, message: message as AnyEvent });
    },
    get logCount() {
      return logCount;
    },
  };
}
