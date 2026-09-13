import { ObservabilityTap } from "@lcase/observability";
import type {
  ArtifactLoadError,
  ArtifactMetadataInput,
  ArtifactReadWritePort,
  AutoLoadResult,
  EmitterFactoryPort,
  EventBusPort,
  EventSink,
  SaveArtifactResult,
} from "@lcase/ports";
import type { AnyEvent, JsonValue, Result } from "@lcase/types";
import { Engine } from "@lcase/engine";
import {
  createHttpJsonExecutor,
  createLocalResourcePermit,
  Worker,
  type WorkerDeps,
} from "@lcase/worker";
import { vi } from "vitest";
import {
  createInProcessMessageRouter,
  type MessageRouter,
} from "@lcase/message-router";
import {
  engineJobTerminalSubscription,
  jobCommandTopic,
  jobTerminalTopic,
  observabilityJobSubscription,
  workerJobCommandSubscription,
} from "@lcase/message-topology/catalogs";
import { localSystemPlan } from "./local-system-plan.js";

// Enough of an ArtifactReadWritePort for a job with no refs and no exports:
// one save of the response payload. Kept here rather than imported from
// worker's own test helpers, which are package-internal.
function createFakeArtifacts() {
  const saved = new Map<string, unknown>();
  let counter = 0;

  function save(
    content: JsonValue,
    contentType: "application/json",
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  function save(
    content: string,
    contentType: `text/${string}`,
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  function save(
    content: Uint8Array,
    contentType: string,
    metadata?: ArtifactMetadataInput,
  ): Promise<SaveArtifactResult>;
  function save(
    content: JsonValue | string | Uint8Array,
  ): Promise<SaveArtifactResult> {
    counter += 1;
    const hash = `fake-hash-${counter}`;
    saved.set(hash, content);
    return Promise.resolve({ status: "saved", hash });
  }

  function load(hash: string): Promise<AutoLoadResult>;
  function load(
    hash: string,
    contentType: "application/json",
  ): Promise<Result<JsonValue, ArtifactLoadError>>;
  function load(
    hash: string,
    contentType: `text/${string}`,
  ): Promise<Result<string, ArtifactLoadError>>;
  function load(
    hash: string,
    contentType: string,
  ): Promise<Result<Uint8Array, ArtifactLoadError>>;
  function load(
    hash: string,
  ): Promise<
    AutoLoadResult | Result<JsonValue | string | Uint8Array, ArtifactLoadError>
  > {
    // Never reached: the slice's job carries no refs and declares no exports.
    return Promise.resolve({
      ok: false,
      error: { code: "NOT_FOUND", message: `no artifact ${hash}` },
    });
  }

  const artifacts: ArtifactReadWritePort = { save, load };
  return { artifacts, saved };
}

function createRecordingSink(id: string) {
  const handled: AnyEvent[] = [];
  const sink: EventSink = {
    id,
    start: async () => {},
    stop: async () => {},
    handle: (event) => {
      handled.push(event);
    },
  };
  return { sink, handled };
}

export type HttpJobGraphOptions = {
  respond?: () => Response;
  maxConcurrentJobs?: number;
  /**
   * The carrier to assemble the graph onto. Defaults to a fresh in-process
   * router; a log-backed one is handed in by the Redis slice, which is the
   * point -- the same components and the same bindings, moved by something
   * else entirely.
   */
  router?: MessageRouter;
};

/**
 * The real component graph for the HTTP JSON job conversation, assembled in
 * the same order the local-system profile uses, with deterministic protocol
 * and artifact collaborators in place of network and disk.
 *
 * Deliberately not the profile itself: that constructs Prisma repositories and
 * a filesystem artifact store. What is under test here is the routing between
 * real component roots, which this reproduces exactly.
 */
export function buildHttpJobGraph(options: HttpJobGraphOptions = {}) {
  const router =
    options.router ?? createInProcessMessageRouter({ plan: localSystemPlan() });
  const jobCommands = router.publisher(jobCommandTopic);
  const jobTerminals = router.publisher(jobTerminalTopic);

  const fetchSpy = vi.fn(
    async () =>
      options.respond?.() ??
      new Response(JSON.stringify({ greeting: "hello" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  const { artifacts, saved } = createFakeArtifacts();
  const lifecycle: WorkerDeps["lifecycle"] = { record: async () => {} };

  const worker = new Worker(
    {
      permits: createLocalResourcePermit({ maxConcurrencyPerKey: 4 }),
      lifecycle,
      protocol: createHttpJsonExecutor({
        fetch: fetchSpy as unknown as typeof fetch,
      }),
      artifacts,
      terminal: jobTerminals,
    },
    {
      maxConcurrentJobs: options.maxConcurrentJobs ?? 4,
      protocolTimeoutMs: 5_000,
      source: "lowercase://worker",
    },
  );

  const bus = {
    publish: vi.fn(),
    subscribe: vi.fn(),
  } as unknown as EventBusPort;

  const engine = new Engine({
    bus,
    ef: {} as EmitterFactoryPort,
    jobParser: {} as never,
    runQuery: {} as never,
    artifacts,
    jobCommands,
  });
  // The terminal reaches the engine and enters its message queue either way;
  // the run state it would fan out into is engine's own concern, tested there.
  engine.enableSideEffects = false;

  // Recorded through a wrapper rather than vi.spyOn: a spy's inferred type
  // drags engine's internal EngineMessage union across the package boundary,
  // and this test only needs what the engine was handed.
  const enqueued: { type: string; event: AnyEvent }[] = [];
  const passThrough = engine.enqueue.bind(engine);
  engine.enqueue = (message) => {
    enqueued.push(message as { type: string; event: AnyEvent });
    passThrough(message);
  };

  // Constructed but never started: no bus subscription, which is what makes
  // every event this tap sees one that arrived by Message.
  const tap = new ObservabilityTap(bus);
  const observed = createRecordingSink("recording-sink");
  tap.attachSink(observed.sink);

  router.bind({
    subscription: workerJobCommandSubscription,
    handler: worker.handleHttpJsonSubmitted,
    maxInFlight: options.maxConcurrentJobs ?? 4,
  });
  router.bind({
    subscription: engineJobTerminalSubscription,
    handler: engine.handleJobTerminal,
  });
  router.bind({
    subscription: observabilityJobSubscription,
    handler: (message) => tap.ingest(message),
  });
  router.seal();

  return {
    router,
    worker,
    engine,
    tap,
    bus,
    jobCommands,
    enqueued,
    fetchSpy,
    saved,
    observed: observed.handled,
  };
}
