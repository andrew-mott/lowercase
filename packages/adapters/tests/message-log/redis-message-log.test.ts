import { describe, expect, it, vi } from "vitest";
import type { RedisClientType } from "redis";
import { RedisMessageLog } from "../../src/message-log/redis-message-log.js";

// Unit-level coverage for the one real branch of adapter logic in
// RedisMessageLog -- ensureStream/ensureConsumerGroup swallowing BUSYGROUP
// as idempotent success. The real-Redis integration test only ever
// exercises that swallow path (calling ensureStream twice really does hit
// BUSYGROUP); forcing a genuinely different xGroupCreate failure
// deterministically against real Redis isn't practical, so that path is
// verified here instead, against a mocked client. Runs unconditionally, no
// Redis required.
function fakeClient(xGroupCreate: ReturnType<typeof vi.fn>): RedisClientType {
  return { xGroupCreate } as unknown as RedisClientType;
}

describe("RedisMessageLog", () => {
  it("rethrows a non-BUSYGROUP failure from ensureConsumerGroup", async () => {
    const xGroupCreate = vi
      .fn()
      .mockRejectedValue(new Error("connection refused"));
    const log = new RedisMessageLog(fakeClient(xGroupCreate));

    await expect(
      log.ensureConsumerGroup("stream", "group", { startAt: "latest" }),
    ).rejects.toThrow("connection refused");
  });
});
