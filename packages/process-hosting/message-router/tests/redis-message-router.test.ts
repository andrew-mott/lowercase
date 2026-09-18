import { describe, expect, it, vi } from "vitest";
import { buildEvent } from "@lcase/events";
import type { AnyEvent } from "@lcase/types";
import type { Subscription, Topic } from "@lcase/ports";
import { defineTopicFor, defineSubscription } from "@lcase/message-topology";
import { createRedisMessageRouter } from "../src/redis/redis-message-router.js";
import type { DeliveryFailure } from "../src/delivery.types.js";
import { createFakeMessageLogStore } from "./helpers/fake-message-log.js";
import { planFor } from "./helpers/plan-for.js";

type TerminalType = "job.httpjson.completed" | "job.httpjson.failed";

const terminal = defineTopicFor<TerminalType>()({
  id: "job-terminal.v1",
  types: ["job.httpjson.completed", "job.httpjson.failed"],
});

const command = defineTopicFor<"job.httpjson.submitted">()({
  id: "job-command.v1",
  types: ["job.httpjson.submitted"],
});

const engineTerminal = defineSubscription({
  id: "engine.job-terminal.v1",
  topics: [terminal],
});

const obsTerminal = defineSubscription({
  id: "observability.job-terminal.v1",
  topics: [terminal],
});

/** One subscription across both topics, so it reads two streams. */
const obsJob = defineSubscription({
  id: "observability.job.v1",
  topics: [command, terminal],
});

// Named for the routes planFor derives, not for the topics: a stream is a
// physical path, and these tests would not notice the difference if they were
// spelled the same.
const STREAM = "test:route.job-terminal.v1";
const COMMAND_STREAM = "test:route.job-command.v1";

function completedEvent(jobid = "job-1"): AnyEvent<"job.httpjson.completed"> {
  return buildEvent(
    "job.httpjson.completed",
    { status: "success", output: "hash-1" },
    {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid,
      capid: "httpjson",
      toolid: "tool-1",
      source: "lowercase://worker/test",
    },
  );
}

type Options = {
  handler?: (message: AnyEvent) => Promise<void>;
  maxInFlight?: number;
  readCount?: number;
  topics?: readonly Topic[];
  subscriptions?: readonly Subscription[];
  routeIdFor?: (topicId: string, subscriptionId: string) => string;
};

function setup(options: Options = {}) {
  const store = createFakeMessageLogStore();
  const failures: DeliveryFailure[] = [];
  const seen: AnyEvent[] = [];

  const router = createRedisMessageRouter({
    plan: planFor(
      {
        topics: options.topics ?? [terminal],
        subscriptions: options.subscriptions ?? [engineTerminal],
      },
      "redis-streams",
      options.routeIdFor,
    ),
    createLog: store.createLog,
    keyPrefix: "test:",
    blockMs: 5,
    ...(options.readCount !== undefined
      ? { readCount: options.readCount }
      : {}),
    reportFailure: (failure) => failures.push(failure),
  });

  const bind = () =>
    router.bind({
      subscription: engineTerminal,
      handler:
        options.handler ??
        (async (message) => {
          seen.push(message);
        }),
      ...(options.maxInFlight !== undefined
        ? { maxInFlight: options.maxInFlight }
        : {}),
    });

  return { store, router, failures, seen, bind };
}

async function sealedAndStarted(options: Options = {}) {
  const ctx = setup(options);
  ctx.bind();
  ctx.router.seal();
  await ctx.router.start();
  return ctx;
}

describe("createRedisMessageRouter — topology", () => {
  const noop = async (): Promise<void> => {};

  it("refuses to seal with an assigned subscription nobody bound", async () => {
    // Both assigned to this role, only the engine one bound by sealedAndStarted.
    const ctx = await sealedAndStarted({
      subscriptions: [engineTerminal, obsTerminal],
    }).catch((e: unknown) => e);

    expect(ctx).toBeInstanceOf(Error);
    expect((ctx as Error).message).toMatch(
      /subscription 'observability.job-terminal.v1' is assigned to role 'test-host' but was never bound/,
    );
  });

  // The route id, not the topic id. A topic can travel several routes and
  // several topics can share one, so nothing here may name a stream after a
  // conversation.
  it("names the stream from the route id and the group from the subscription id", async () => {
    const { store, router } = await sealedAndStarted();

    expect(store.provisionedStreams).toEqual([STREAM]);
    expect(store.provisionedGroups).toEqual([
      `${STREAM}|engine.job-terminal.v1`,
    ]);

    await router.stop();
  });

  it("opens a connection for publishing plus one per read loop", async () => {
    const { store, router } = await sealedAndStarted();

    expect(store.logCount).toBe(2);

    await router.stop();
    expect(store.closed).toHaveLength(2);
  });

  it("refuses to bind a subscription this role was not assigned", () => {
    const { router } = setup();

    expect(() =>
      router.bind({
        subscription: { id: "undeclared.v1", topics: [terminal] },
        handler: noop,
      }),
    ).toThrow(
      /subscription 'undeclared.v1' is not assigned to role 'test-host'/,
    );
  });

  it("refuses to bind after seal, and to seal twice", () => {
    const { router, bind } = setup();
    bind();
    router.seal();

    expect(() =>
      router.bind({ subscription: engineTerminal, handler: noop }),
    ).toThrow(/cannot bind 'engine.job-terminal.v1' after seal\(\)/);
    expect(() => router.seal()).toThrow(/already sealed/);
  });

  // One publication, several destinations, and the component that published it
  // still named only a topic. Which routes exist is the deployment's, and the
  // publisher below is handed the same object either way.
  it("appends one publication to every route its topic travels", async () => {
    const ctx = setup({
      subscriptions: [engineTerminal, obsTerminal],
      // Each consumer reads its own route off the same topic.
      routeIdFor: (topicId, subscriptionId) => `${topicId}#${subscriptionId}`,
    });
    ctx.bind();
    ctx.router.bind({ subscription: obsTerminal, handler: noop });
    ctx.router.seal();
    await ctx.router.start();

    await ctx.router.publisher(terminal).publish(completedEvent());

    // One admission naming both streams, not two publish calls. A consumer of
    // the first must not be able to act on this Message before the second
    // exists.
    expect(ctx.store.admissions).toEqual([
      [
        "test:job-terminal.v1#engine.job-terminal.v1",
        "test:job-terminal.v1#observability.job-terminal.v1",
      ],
    ]);
    expect(
      ctx.store.streams.get("test:job-terminal.v1#engine.job-terminal.v1"),
    ).toHaveLength(1);
    expect(
      ctx.store.streams.get(
        "test:job-terminal.v1#observability.job-terminal.v1",
      ),
    ).toHaveLength(1);

    await ctx.router.stop();
  });

  it("refuses to publish before seal, and before start", async () => {
    const { router, bind } = setup();
    const publisher = router.publisher(terminal);

    await expect(publisher.publish(completedEvent())).rejects.toThrow(
      /before seal\(\)/,
    );

    bind();
    router.seal();

    // Sealed but not started: there is no connection yet, so this cannot
    // silently reach nobody the way an in-process publish never could.
    await expect(publisher.publish(completedEvent())).rejects.toThrow(
      /before start\(\)/,
    );
  });

  it("refuses a Message type its topic does not declare", async () => {
    const { router } = await sealedAndStarted();
    const publisher = router.publisher(terminal) as unknown as {
      publish(m: AnyEvent): Promise<void>;
    };

    await expect(
      publisher.publish({ ...completedEvent(), type: "run.completed" }),
    ).rejects.toThrow(/does not allow 'run.completed'/);

    await router.stop();
  });
});

describe("createRedisMessageRouter — delivery", () => {
  it("delivers a published Message to its subscription's handler and acknowledges it", async () => {
    const { router, store, seen } = await sealedAndStarted();
    const published = completedEvent();

    await router.publisher(terminal).publish(published);
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    expect(seen[0]).toEqual(published);
    await vi.waitFor(() =>
      expect(store.pendingFor(STREAM, engineTerminal.id)).toEqual([]),
    );

    await router.stop();
  });

  // The whole reason acknowledgement is unconditional: a failed handler is
  // reported and dropped, exactly as the in-process mailbox already does. If
  // failures were left pending they would accumulate forever with nothing
  // reclaiming them, which looks like durability without being any.
  it("acknowledges a Message whose handler threw, after reporting it", async () => {
    const { router, store, failures } = await sealedAndStarted({
      handler: async () => {
        throw new Error("sink exploded");
      },
    });

    await router.publisher(terminal).publish(completedEvent());
    await vi.waitFor(() => expect(failures).toHaveLength(1));

    expect(failures[0]?.subscriptionId).toBe(engineTerminal.id);
    expect(failures[0]?.messageType).toBe("job.httpjson.completed");
    await vi.waitFor(() =>
      expect(store.pendingFor(STREAM, engineTerminal.id)).toEqual([]),
    );

    await router.stop();
  });

  // Nothing validated the envelope on the way in, so the reader has to
  // re-establish what publish() guarantees locally -- otherwise the cast onto
  // the handler's parameter type is unfounded.
  it("reports and acknowledges an entry whose type the topic does not declare, without invoking the handler", async () => {
    const { router, store, failures, seen } = await sealedAndStarted();

    store.inject(STREAM, { ...completedEvent(), type: "run.completed" });
    await vi.waitFor(() => expect(failures).toHaveLength(1));

    expect(seen).toEqual([]);
    expect(failures[0]?.error).toBeInstanceOf(Error);
    expect((failures[0]?.error as Error).message).toMatch(
      /no topic on route 'route.job-terminal.v1' declares/,
    );
    await vi.waitFor(() =>
      expect(store.pendingFor(STREAM, engineTerminal.id)).toEqual([]),
    );

    await router.stop();
  });

  it("survives a malformed payload rather than taking its read loop down", async () => {
    const { router, store, failures, seen } = await sealedAndStarted();

    store.inject(STREAM, null);
    await vi.waitFor(() => expect(failures).toHaveLength(1));

    // The loop is still running: a real Message published afterwards arrives.
    const published = completedEvent("job-2");
    await router.publisher(terminal).publish(published);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.id).toBe(published.id);

    await router.stop();
  });

  it("bounds concurrent handler invocations by maxInFlight", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: (() => void)[] = [];

    const { router } = await sealedAndStarted({
      maxInFlight: 2,
      handler: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => release.push(resolve));
        inFlight -= 1;
      },
    });

    const publisher = router.publisher(terminal);
    for (let i = 0; i < 6; i++)
      await publisher.publish(completedEvent(`j${i}`));

    await vi.waitFor(() => expect(release).toHaveLength(2));
    expect(peak).toBe(2);

    // Drain, so stop() is not waiting on handlers that never resolve.
    for (let i = 0; i < 20 && release.length > 0; i++) {
      release.splice(0).forEach((r) => r());
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await router.stop();
  });

  it("stops the read loops and closes every connection", async () => {
    const { router, store, seen } = await sealedAndStarted();

    await router.publisher(terminal).publish(completedEvent());
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    await router.stop();
    expect(store.closed).toHaveLength(2);

    // Nothing is delivered after stop, and publishing has no connection left.
    store.inject(STREAM, completedEvent("job-after-stop"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toHaveLength(1);
    await expect(
      router.publisher(terminal).publish(completedEvent()),
    ).rejects.toThrow(/before start\(\)/);
  });
});

describe("createRedisMessageRouter — multi-topic subscriptions", () => {
  function submittedEvent(jobid = "job-1"): AnyEvent<"job.httpjson.submitted"> {
    return buildEvent(
      "job.httpjson.submitted",
      { url: "https://example.test/jobs", method: "POST", refs: [] },
      {
        flowid: "flow-1",
        flowversionid: "flowversion-1",
        runid: "run-1",
        stepid: "step-1",
        jobid,
        capid: "httpjson",
        toolid: "tool-1",
        source: "lowercase://engine/test",
      },
    );
  }

  /**
   * One subscription over both topics, so it reads two streams into one
   * lane. `block` gates every handler, which is how the concurrency bound below
   * is observed without depending on which stream is read first.
   */
  async function multiTopic(
    options: { maxInFlight?: number; block?: Promise<void> } = {},
  ) {
    const store = createFakeMessageLogStore();
    const failures: DeliveryFailure[] = [];
    const started: AnyEvent[] = [];

    const router = createRedisMessageRouter({
      plan: planFor(
        { topics: [command, terminal], subscriptions: [obsJob] },
        "redis-streams",
      ),
      createLog: store.createLog,
      keyPrefix: "test:",
      blockMs: 5,
      reportFailure: (failure) => failures.push(failure),
    });

    router.bind({
      subscription: obsJob,
      handler: async (message) => {
        started.push(message);
        await options.block;
      },
      ...(options.maxInFlight !== undefined
        ? { maxInFlight: options.maxInFlight }
        : {}),
    });
    router.seal();
    await router.start();

    return { store, router, failures, started };
  }

  it("provisions its group on every selected stream and opens one connection per reader", async () => {
    const { store, router } = await multiTopic();

    expect(store.provisionedStreams).toEqual([COMMAND_STREAM, STREAM]);
    // One group *name* on two streams. A Redis consumer group belongs to one
    // stream, so these are two independent group instances with their own
    // cursors, not one checkpoint spanning both.
    expect(store.provisionedGroups).toEqual([
      `${COMMAND_STREAM}|observability.job.v1`,
      `${STREAM}|observability.job.v1`,
    ]);
    // One publisher connection plus one per reader, because a blocking read
    // occupies its connection for the whole block window.
    expect(store.logCount).toBe(3);

    await router.stop();
    expect(store.closed).toHaveLength(3);
  });

  it("feeds both streams into one handler and acknowledges each on its own stream", async () => {
    const { store, router, started } = await multiTopic();

    await router.publisher(command).publish(submittedEvent("job-1"));
    await router.publisher(terminal).publish(completedEvent("job-2"));

    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(started.map((m) => m.type).sort()).toEqual([
      "job.httpjson.completed",
      "job.httpjson.submitted",
    ]);

    await vi.waitFor(() => expect(store.acked).toHaveLength(2));
    expect(
      store.acked.map((entry) => entry.split("|").slice(0, 2).join("|")).sort(),
    ).toEqual([
      `${COMMAND_STREAM}|observability.job.v1`,
      `${STREAM}|observability.job.v1`,
    ]);
    expect(store.pendingFor(COMMAND_STREAM, "observability.job.v1")).toEqual(
      [],
    );
    expect(store.pendingFor(STREAM, "observability.job.v1")).toEqual([]);

    await router.stop();
  });

  // The point of one lane: maxInFlight bounds the subscription, not each
  // reader. Which stream is read first is deliberately not asserted -- Redis
  // provides no order across separate streams and neither does this.
  it("shares one concurrency limit across its readers", async () => {
    let release!: () => void;
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { router, store, started } = await multiTopic({
      maxInFlight: 1,
      block,
    });

    await router.publisher(command).publish(submittedEvent("job-1"));
    await router.publisher(terminal).publish(completedEvent("job-2"));

    // One handler running, and it stays that way while blocked even though the
    // two entries came from different readers.
    await vi.waitFor(() => expect(started).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(started).toHaveLength(1);
    // The other entry is read but unacknowledged, so it is still recoverable.
    expect(store.acked).toHaveLength(0);

    release();
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(new Set(started.map((m) => m.type))).toEqual(
      new Set(["job.httpjson.submitted", "job.httpjson.completed"]),
    );

    await router.stop();
  });
});

// Several of a subscription's topics routed onto one path. This is what an
// ordered observation route is made of, and the carrier knows nothing about
// observability -- it sees two edges naming one route id.
describe("createRedisMessageRouter — converged routes", () => {
  const OBSERVATION = "test:job.observation.v1";

  function submittedEvent(jobid = "job-1"): AnyEvent<"job.httpjson.submitted"> {
    return buildEvent(
      "job.httpjson.submitted",
      { url: "https://example.test/jobs", method: "POST", refs: [] },
      {
        flowid: "flow-1",
        flowversionid: "flowversion-1",
        runid: "run-1",
        stepid: "step-1",
        jobid,
        capid: "httpjson",
        toolid: "tool-1",
        source: "lowercase://engine/test",
      },
    );
  }

  async function converged() {
    const store = createFakeMessageLogStore();
    const failures: DeliveryFailure[] = [];
    const seen: AnyEvent[] = [];

    const router = createRedisMessageRouter({
      plan: planFor(
        { topics: [command, terminal], subscriptions: [obsJob] },
        "redis-streams",
        // Both of this subscription's edges onto one route, which is the whole
        // mechanism: the manifest says where Messages travel, and two edges
        // naming one place is how they end up on one log.
        () => "job.observation.v1",
      ),
      createLog: store.createLog,
      keyPrefix: "test:",
      blockMs: 5,
      reportFailure: (failure) => failures.push(failure),
    });

    router.bind({
      subscription: obsJob,
      handler: async (message) => {
        seen.push(message);
      },
    });
    router.seal();
    await router.start();

    return { store, router, failures, seen };
  }

  it("reads one stream through one group and one connection", async () => {
    const { store, router } = await converged();

    expect(store.provisionedStreams).toEqual([OBSERVATION]);
    expect(store.provisionedGroups).toEqual([
      `${OBSERVATION}|observability.job.v1`,
    ]);
    // One publisher connection plus one reader, where the same subscription on
    // separate routes opens two. Two readers here would be two consumers of one
    // group splitting the entries between them.
    expect(store.logCount).toBe(2);

    await router.stop();
  });

  it("delivers what the log ordered, not what arrived first", async () => {
    const { router, seen } = await converged();

    // Published in causal order the way the real graph produces them: a command
    // first, then the terminal it leads to.
    await router.publisher(command).publish(submittedEvent());
    await router.publisher(terminal).publish(completedEvent());

    await vi.waitFor(() => expect(seen).toHaveLength(2));
    // Asserted in order, unlike the separate-routes case above. One log and one
    // cursor carry both topics, so there is no race for the lane to resolve.
    expect(seen.map((m) => m.type)).toEqual([
      "job.httpjson.submitted",
      "job.httpjson.completed",
    ]);

    await router.stop();
  });

  it("accepts every type its route carries and reports one it does not", async () => {
    const { router, store, seen, failures } = await converged();

    store.inject(OBSERVATION, { ...completedEvent(), type: "run.completed" });
    await router.publisher(command).publish(submittedEvent());

    // The command still arrives: a reader's allowed list is the union of what
    // the topics on its route declare, not one topic's.
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]!.type).toBe("job.httpjson.submitted");

    expect(failures).toHaveLength(1);
    expect(String(failures[0]!.error)).toMatch(
      /carried 'run.completed', which no topic on route 'job.observation.v1' declares; it carries \[job-command.v1, job-terminal.v1\]/,
    );

    await router.stop();
  });
});

// readCount and maxInFlight answer different questions: one is how many entries
// this consumer claims responsibility for, the other how many handlers run at
// once. They default to the same number, which is exactly why it is worth
// proving they can differ.
describe("createRedisMessageRouter — read count", () => {
  it("claims up to readCount while the lane still runs maxInFlight at a time", async () => {
    let release!: () => void;
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: AnyEvent[] = [];
    const { router, store } = await sealedAndStarted({
      maxInFlight: 1,
      readCount: 3,
      handler: async (message) => {
        started.push(message);
        await block;
      },
    });

    const publisher = router.publisher(terminal);
    await publisher.publish(completedEvent("job-1"));
    await publisher.publish(completedEvent("job-2"));
    await publisher.publish(completedEvent("job-3"));

    // All three claimed into this consumer's pending list, one handler running.
    await vi.waitFor(() =>
      expect(store.pendingFor(STREAM, engineTerminal.id)).toHaveLength(3),
    );
    expect(started).toHaveLength(1);
    expect(store.acked).toHaveLength(0);

    release();
    await vi.waitFor(() => expect(started).toHaveLength(3));
    await vi.waitFor(() =>
      expect(store.pendingFor(STREAM, engineTerminal.id)).toEqual([]),
    );

    await router.stop();
  });

  it("defaults readCount to maxInFlight, so nothing is claimed beyond the bound", async () => {
    let release!: () => void;
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { router, store } = await sealedAndStarted({
      maxInFlight: 1,
      handler: async () => {
        await block;
      },
    });

    const publisher = router.publisher(terminal);
    await publisher.publish(completedEvent("job-1"));
    await publisher.publish(completedEvent("job-2"));

    await vi.waitFor(() =>
      expect(store.pendingFor(STREAM, engineTerminal.id)).toHaveLength(1),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(store.pendingFor(STREAM, engineTerminal.id)).toHaveLength(1);

    release();
    await router.stop();
  });
});
