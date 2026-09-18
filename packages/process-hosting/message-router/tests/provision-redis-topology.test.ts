import { describe, expect, it, vi } from "vitest";
import { buildEvent } from "@lcase/events";
import {
  assertManifest,
  defineSubscription,
  defineTopicFor,
  hostPlanFor,
  resolveHostPlan,
  type MessageCatalog,
  type MessagingManifest,
} from "@lcase/message-topology";
import { createRedisMessageRouter } from "../src/redis/redis-message-router.js";
import { provisionRedisTopology } from "../src/redis/provision-redis-topology.js";
import { createFakeMessageLogStore } from "./helpers/fake-message-log.js";

const command = defineTopicFor<"job.httpjson.submitted">()({
  id: "command.v1",
  types: ["job.httpjson.submitted"],
});

const terminal = defineTopicFor<"job.httpjson.completed">()({
  id: "terminal.v1",
  types: ["job.httpjson.completed"],
});

const work = defineSubscription({ id: "work.command.v1", topics: [command] });
const advance = defineSubscription({
  id: "advance.terminal.v1",
  topics: [terminal],
});
/** Both topics converged onto one route, like Observability's. */
const audit = defineSubscription({
  id: "audit.all.v1",
  topics: [command, terminal],
});

const catalog: MessageCatalog = {
  topics: [command, terminal],
  subscriptions: [work, advance, audit],
};

// The remote-worker shape with no product identities: a front role that
// publishes commands and reads the rest, a work role that answers them.
const manifest: MessagingManifest = {
  id: "split-test",
  carrier: "redis-streams",
  topicIds: [command.id, terminal.id],
  subscriptionIds: [work.id, advance.id, audit.id],
  routes: [
    { topicId: command.id, subscriptionId: work.id, routeId: "command-work" },
    { topicId: command.id, subscriptionId: audit.id, routeId: "audit" },
    {
      topicId: terminal.id,
      subscriptionId: advance.id,
      routeId: "terminal-work",
    },
    { topicId: terminal.id, subscriptionId: audit.id, routeId: "audit" },
  ],
  roles: [
    {
      id: "front",
      publishesTo: [command.id],
      consumesFrom: [advance.id, audit.id],
    },
    { id: "work", publishesTo: [terminal.id], consumesFrom: [work.id] },
  ],
};
assertManifest(catalog, manifest);

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
      source: "lowercase://test",
    },
  );
}

/** Both roles as real routers over one fake Redis, nothing started yet. */
function deployment(store: ReturnType<typeof createFakeMessageLogStore>) {
  const routerFor = (roleId: string) =>
    createRedisMessageRouter({
      plan: resolveHostPlan(hostPlanFor(manifest, roleId), catalog),
      createLog: store.createLog,
      keyPrefix: "test:",
      blockMs: 5,
    });

  const front = routerFor("front");
  front.bind({ subscription: advance, handler: async () => {} });
  front.bind({ subscription: audit, handler: async () => {} });
  front.seal();

  const received: string[] = [];
  const worker = routerFor("work");
  worker.bind({
    subscription: work,
    handler: async (message) => {
      received.push(message.jobid);
    },
  });
  worker.seal();

  return { front, worker, received };
}

describe("provisionRedisTopology", () => {
  it("creates one group per distinct route and subscription, in manifest order", async () => {
    const store = createFakeMessageLogStore();

    const result = await provisionRedisTopology({
      manifest,
      log: await store.createLog(),
      keyPrefix: "test:",
    });

    // audit.all.v1 appears once on the audit route although two topics
    // travel it.
    expect(result.groups).toEqual([
      { stream: "test:command-work", group: "work.command.v1" },
      { stream: "test:audit", group: "audit.all.v1" },
      { stream: "test:terminal-work", group: "advance.terminal.v1" },
    ]);
    expect(result.streams).toEqual([
      "test:command-work",
      "test:audit",
      "test:terminal-work",
    ]);
    expect(store.provisionedGroups).toEqual([
      "test:command-work|work.command.v1",
      "test:audit|audit.all.v1",
      "test:terminal-work|advance.terminal.v1",
    ]);
  });

  it("defaults to the prefix a host uses when none is configured", async () => {
    const store = createFakeMessageLogStore();

    const result = await provisionRedisTopology({
      manifest,
      log: await store.createLog(),
    });

    expect(result.streams).toEqual([
      "lcase:command-work",
      "lcase:audit",
      "lcase:terminal-work",
    ]);
  });

  // The race this exists for. The front role publishes before the work role has
  // started, which is exactly what a publisher starting first looks like.
  it("delivers a command published before its consumer started", async () => {
    const store = createFakeMessageLogStore();
    const { front, worker, received } = deployment(store);

    await provisionRedisTopology({
      manifest,
      log: await store.createLog(),
      keyPrefix: "test:",
    });
    await front.start();
    await front.publisher(command).publish(submitted("job-early"));
    await worker.start();

    await vi.waitFor(() => expect(received).toEqual(["job-early"]));

    await worker.stop();
    await front.stop();
  });

  // The same order without it, so the test above is shown to depend on
  // provisioning rather than on timing.
  it("without provisioning, the same command is skipped", async () => {
    const store = createFakeMessageLogStore();
    const { front, worker, received } = deployment(store);

    await front.start();
    await front.publisher(command).publish(submitted("job-early"));
    await worker.start();
    await front.publisher(command).publish(submitted("job-late"));

    await vi.waitFor(() => expect(received).toEqual(["job-late"]));

    await worker.stop();
    await front.stop();
  });

  it("leaves existing groups where they are when run again", async () => {
    const store = createFakeMessageLogStore();
    const log = await store.createLog();

    const waiting = submitted("job-waiting");

    await provisionRedisTopology({ manifest, log, keyPrefix: "test:" });
    await log.publish(["test:command-work"], waiting);
    await provisionRedisTopology({ manifest, log, keyPrefix: "test:" });

    // A second run that recreated the group at `$` would have moved its cursor
    // past the waiting entry.
    const entries = await log.readGroup(
      "test:command-work",
      "work.command.v1",
      "reader",
      { batchSize: 10, blockMs: 5 },
    );
    expect(entries.map((e) => e.message.id)).toEqual([waiting.id]);
  });

  it("does not close the connection it was given", async () => {
    const store = createFakeMessageLogStore();

    await provisionRedisTopology({
      manifest,
      log: await store.createLog(),
      keyPrefix: "test:",
    });

    expect(store.closed).toEqual([]);
  });

  it("refuses a manifest carried in process", async () => {
    const store = createFakeMessageLogStore();

    await expect(
      provisionRedisTopology({
        manifest: { ...manifest, carrier: "in-process" },
        log: await store.createLog(),
      }),
    ).rejects.toThrow(
      "manifest 'split-test' is carried by 'in-process', so there is no Redis topology to provision",
    );
  });
});
