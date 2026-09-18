import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type RedisClientType } from "redis";
import { RedisMessageLog } from "@lcase/adapters/message-log";
import { buildEvent } from "@lcase/events";
import {
  createRedisMessageRouter,
  redisStreamKey,
  type RedisMessageRouter,
} from "@lcase/message-router";
import { hostPlanFor, resolveHostPlan } from "@lcase/message-topology";
import {
  engineJobTerminalSubscription,
  jobCatalog,
  jobCommandTopic,
  observabilityJobSubscription,
  workerJobCommandSubscription,
} from "@lcase/message-topology/catalogs";
import {
  apiEngineObserverHost,
  remoteWorker,
  workerHost,
} from "@lcase/message-topology/deployments";
import { runProvision } from "../src/tasks/provision.js";

// Skipped rather than failed without Redis: not having started the container
// is the expected path locally, and CI supplies it.
const redisUrl = process.env.REDIS_TEST_URL;

const COMMAND_ROUTE = "job.command-work.v1";

function submitted(jobid: string) {
  return buildEvent(
    "job.httpjson.submitted",
    { url: "http://tool.test", refs: [] },
    {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid,
      capid: "httpjson",
      toolid: "httpjson",
      source: "lowercase://engine",
    },
  );
}

/**
 * The deployment in this process: both roles of `remote-worker` as real Redis
 * routers, each bound the way its host binds them, with stub handlers.
 *
 * Built from the topology package rather than from either host app, which this
 * app cannot import. What differs between hosts here is only who starts first,
 * and that is the thing under test -- the handlers doing real work is the host
 * suites' claim, not this one's.
 */
function deployment(keyPrefix: string) {
  const routerFor = (roleId: string) =>
    createRedisMessageRouter({
      plan: resolveHostPlan(hostPlanFor(remoteWorker, roleId), jobCatalog),
      createLog: async () => {
        const client: RedisClientType = createClient({ url: redisUrl });
        await client.connect();
        return new RedisMessageLog(client);
      },
      keyPrefix,
      // Bounds how long stop() waits on a blocking read.
      blockMs: 50,
    });

  const api = routerFor(apiEngineObserverHost.id);
  api.bind({
    subscription: engineJobTerminalSubscription,
    handler: async () => {},
  });
  api.bind({
    subscription: observabilityJobSubscription,
    handler: async () => {},
  });
  api.seal();

  const received: string[] = [];
  const worker = routerFor(workerHost.id);
  worker.bind({
    subscription: workerJobCommandSubscription,
    handler: async (message) => {
      received.push(message.jobid);
    },
  });
  worker.seal();

  const publishCommand = (jobid: string) =>
    api.publisher(jobCommandTopic).publish(submitted(jobid));

  return { api, worker, received, publishCommand };
}

describe.skipIf(!redisUrl)("provision against live Redis", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  /**
   * A fresh prefix per test, which is what makes an empty Redis: no stream or
   * group under it exists yet. Everything under it is removed afterwards.
   */
  async function setup() {
    const keyPrefix = `lcase-test:${Date.now()}-${Math.random().toString(36).slice(2)}:`;

    const client: RedisClientType = createClient({ url: redisUrl });
    await client.connect();
    cleanups.push(async () => {
      const keys = await client.keys(`${keyPrefix}*`);
      if (keys.length > 0) await client.del(keys);
      await client.quit();
    });

    const routers = deployment(keyPrefix);
    const stopAll = (...toStop: RedisMessageRouter[]) =>
      cleanups.push(async () => {
        for (const router of toStop) await router.stop();
      });
    stopAll(routers.api, routers.worker);

    const commandStream = redisStreamKey(keyPrefix, COMMAND_ROUTE);
    const workerGroup = async () => {
      const groups = await client.xInfoGroups(commandStream);
      return groups.find((g) => g.name === workerJobCommandSubscription.id);
    };

    return { keyPrefix, client, commandStream, workerGroup, ...routers };
  }

  // The race provisioning exists for: the API host is up and publishing before
  // the Worker host has started, which is what compose does when nothing makes
  // one wait for the other.
  it("delivers a command published before the Worker host started", async () => {
    const { keyPrefix, api, worker, received, publishCommand } = await setup();

    await runProvision({ messaging: { url: redisUrl!, keyPrefix } });
    await api.start();
    await publishCommand("job-early");
    await worker.start();

    await vi.waitFor(() => expect(received).toEqual(["job-early"]), {
      timeout: 5_000,
      interval: 50,
    });
  });

  // The same order without provisioning, so the test above is shown to pass
  // because of it rather than because of timing. Both assertions are
  // deterministic: the group's cursor, and a later command arriving alone.
  it("without provisioning, that command is skipped", async () => {
    const {
      client,
      commandStream,
      workerGroup,
      api,
      worker,
      received,
      publishCommand,
    } = await setup();

    await api.start();
    await publishCommand("job-early");
    const [early] = await client.xRange(commandStream, "-", "+");
    await worker.start();

    // Created after the entry, so its cursor already starts past it.
    expect((await workerGroup())?.["last-delivered-id"]).toBe(early!.id);

    await publishCommand("job-late");
    await vi.waitFor(() => expect(received).toEqual(["job-late"]), {
      timeout: 5_000,
      interval: 50,
    });
  });

  it("leaves groups where they are when run again", async () => {
    const { keyPrefix, workerGroup, api, worker, received, publishCommand } =
      await setup();
    const config = { messaging: { url: redisUrl!, keyPrefix } };

    await runProvision(config);
    await api.start();
    await publishCommand("job-waiting");
    await runProvision(config);

    // Nothing has read the entry yet, and provisioning again did not move the
    // cursor past it.
    expect((await workerGroup())?.["last-delivered-id"]).toBe("0-0");

    await worker.start();
    await vi.waitFor(() => expect(received).toEqual(["job-waiting"]), {
      timeout: 5_000,
      interval: 50,
    });
  });
});
