import { describe, expect, it } from "vitest";
import { defineSubscription, defineTopicFor } from "@lcase/message-topology";
import { createRedisMessageRouter } from "../src/redis/redis-message-router.js";
import {
  DEFAULT_REDIS_KEY_PREFIX,
  redisGroupName,
  redisStreamKey,
} from "../src/redis/redis-naming.js";
import { createFakeMessageLogStore } from "./helpers/fake-message-log.js";
import { planFor } from "./helpers/plan-for.js";

const terminal = defineTopicFor<"job.httpjson.completed">()({
  id: "job-terminal.v1",
  types: ["job.httpjson.completed"],
});

const engineTerminal = defineSubscription({
  id: "engine.job-terminal.v1",
  topics: [terminal],
});

describe("redis naming", () => {
  // Pinned rather than merely used: changing the default moves every deployment
  // that sets no prefix onto new, empty streams, stranding whatever was queued
  // on the old ones.
  it("defaults the key prefix to lcase:", () => {
    expect(DEFAULT_REDIS_KEY_PREFIX).toBe("lcase:");
  });

  it("keys a stream by prefix and route id", () => {
    expect(redisStreamKey("lcase:", "job.command-work.v1")).toBe(
      "lcase:job.command-work.v1",
    );
  });

  it("names a group for its subscription, without the prefix", () => {
    expect(redisGroupName("worker.job-command.v1")).toBe(
      "worker.job-command.v1",
    );
  });

  // The drift guard. Something provisioning ahead of a host is only correct if
  // the host, left to its defaults, reads exactly the keys these functions give.
  it("is what a router with no configured prefix provisions", async () => {
    const store = createFakeMessageLogStore();
    const router = createRedisMessageRouter({
      plan: planFor(
        { topics: [terminal], subscriptions: [engineTerminal] },
        "redis-streams",
      ),
      createLog: store.createLog,
      blockMs: 5,
    });
    router.bind({ subscription: engineTerminal, handler: async () => {} });
    router.seal();
    await router.start();

    const stream = redisStreamKey(
      DEFAULT_REDIS_KEY_PREFIX,
      "route.job-terminal.v1",
    );
    expect(store.provisionedStreams).toEqual([stream]);
    expect(store.provisionedGroups).toEqual([
      `${stream}|${redisGroupName(engineTerminal.id)}`,
    ]);

    await router.stop();
  });
});
