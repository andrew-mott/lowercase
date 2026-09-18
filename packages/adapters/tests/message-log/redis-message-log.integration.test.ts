import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type RedisClientType } from "redis";
import { RedisMessageLog } from "../../src/message-log/redis-message-log.js";
import type { AnyEvent } from "@lcase/types";

// Real integration test against a live Redis instance -- gated on
// REDIS_TEST_URL since there's no meaningful way to fake consumer-group
// delivery, ack, and pending-entry recovery. Run `docker compose up -d
// redis` and copy .env.test.local.example to .env.test.local (loaded
// automatically, see tests/setup-env.ts) to exercise this locally; CI
// provides the var directly via the workflow's redis service. There is no
// separate mocked-client unit-test file for this adapter -- unlike
// S3ArtifactStore, there's no error-mapping branch logic substantial
// enough to isolate from a real connection.
const url = process.env.REDIS_TEST_URL;

function fixtureEvent(id: string): AnyEvent {
  return {
    id,
    source: "lcase://test/redis-message-log",
    specversion: "1.0",
    time: new Date().toISOString(),
    type: "run.requested",
    data: {},
    domain: "run",
    action: "requested",
    traceparent: "00-0000000000000000000000000000000000-0000000000000000-01",
    traceid: "0000000000000000000000000000000000",
    spanid: "0000000000000000",
  } as unknown as AnyEvent;
}

describe.skipIf(!url)("RedisMessageLog (real Redis)", () => {
  let client: RedisClientType;
  let messageLog: RedisMessageLog;

  beforeAll(async () => {
    client = createClient({ url });
    await client.connect();
    messageLog = new RedisMessageLog(client);
  });

  afterAll(async () => {
    await messageLog.close();
  });

  it("provisions a stream and consumer group idempotently", async () => {
    const stream = `test-stream-${Date.now()}-provision`;
    await messageLog.ensureStream(stream);
    await messageLog.ensureStream(stream);
    await messageLog.ensureConsumerGroup(stream, "group-a", {
      startAt: "latest",
    });
    await messageLog.ensureConsumerGroup(stream, "group-a", {
      startAt: "latest",
    });
  });

  it("publishes and reads a message back through a consumer group", async () => {
    const stream = `test-stream-${Date.now()}-roundtrip`;
    const group = "group-a";
    await messageLog.ensureConsumerGroup(stream, group, {
      startAt: "beginning",
    });

    const event = fixtureEvent("evt-1");
    const [publishedId] = await messageLog.publish([stream], event);

    const entries = await messageLog.readGroup(stream, group, "consumer-1", {
      batchSize: 10,
      blockMs: 100,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(publishedId);
    expect(entries[0].message).toEqual(event);
  });

  it("acks a message so it no longer shows up as pending", async () => {
    const stream = `test-stream-${Date.now()}-ack`;
    const group = "group-a";
    await messageLog.ensureConsumerGroup(stream, group, {
      startAt: "beginning",
    });

    await messageLog.publish([stream], fixtureEvent("evt-ack"));
    const [entry] = await messageLog.readGroup(stream, group, "consumer-1", {
      batchSize: 10,
      blockMs: 100,
    });
    await messageLog.ack(stream, group, [entry.id]);

    const reclaimed = await messageLog.claimPending(
      stream,
      group,
      "consumer-2",
      { minIdleMs: 0 },
    );
    expect(reclaimed.map((e) => e.id)).not.toContain(entry.id);
  });

  it("recovers an unacked message via claimPending after it goes idle", async () => {
    const stream = `test-stream-${Date.now()}-recovery`;
    const group = "group-a";
    await messageLog.ensureConsumerGroup(stream, group, {
      startAt: "beginning",
    });

    const event = fixtureEvent("evt-recovery");
    await messageLog.publish([stream], event);

    // Consumer A reads but never acks -- simulates a crash mid-processing.
    const [delivered] = await messageLog.readGroup(
      stream,
      group,
      "consumer-a",
      { batchSize: 10, blockMs: 100 },
    );
    expect(delivered.message).toEqual(event);

    await new Promise((resolve) => setTimeout(resolve, 30));

    // Consumer B claims it once it's been idle past minIdleMs.
    const claimed = await messageLog.claimPending(stream, group, "consumer-b", {
      minIdleMs: 20,
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(delivered.id);
    expect(claimed[0].message).toEqual(event);

    // Consumer B can now ack it.
    await messageLog.ack(stream, group, [claimed[0].id]);

    // It's genuinely gone, not duplicated as a "new" message.
    const freshRead = await messageLog.readGroup(stream, group, "consumer-b", {
      batchSize: 10,
      blockMs: 50,
    });
    expect(freshRead).toHaveLength(0);
  });

  // One admission across several streams, which is how a deployment gives a
  // subscription its own path through a conversation without the publisher
  // knowing. The non-interleaving half of the guarantee is not observable from
  // a single client; what is checkable here is that one call lands everywhere
  // and reports an id per stream, in the order asked for.
  it("appends one message to several streams and returns an id per stream", async () => {
    const base = `test-stream-${Date.now()}-fanout`;
    const work = `${base}-work`;
    const observation = `${base}-observation`;
    const group = "group-a";
    for (const stream of [work, observation]) {
      await messageLog.ensureConsumerGroup(stream, group, {
        startAt: "beginning",
      });
    }

    const event = fixtureEvent("evt-fanout");
    const ids = await messageLog.publish([work, observation], event);
    expect(ids).toHaveLength(2);

    for (const [index, stream] of [work, observation].entries()) {
      const entries = await messageLog.readGroup(stream, group, "consumer-1", {
        batchSize: 10,
        blockMs: 100,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(ids[index]);
      expect(entries[0].message).toEqual(event);
    }
  });
});
