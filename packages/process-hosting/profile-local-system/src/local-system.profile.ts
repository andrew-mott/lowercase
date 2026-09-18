import { InMemoryEventBus } from "@lcase/adapters/event-bus";
import { EmitterFactory, eventSchemaRegistry } from "@lcase/events";
import { JobParser } from "@lcase/events/parsers";
import { createArtifactReadWritePort } from "@lcase/artifacts";
import { ConcurrencyLimiter, Limiter } from "@lcase/limiter";
import { ReplayEngine } from "@lcase/replay";
import { JsonlEventLog } from "@lcase/adapters/event-store";
import path from "path";
import { PrismaArtifactRepository } from "@lcase/adapters/artifact-repository";
import { PrismaFlowRepository } from "@lcase/adapters/flow-repository";
import { PrismaRunRepository } from "@lcase/adapters/run-repository";
import { PrismaRunQuery } from "@lcase/adapters/run-query";
import { PrismaSimRepository } from "@lcase/adapters/sim-repository";
import { PrismaRunStepProjectionRepository } from "@lcase/adapters/run-step-projection-repository";
import { PrismaEvalResultRepository } from "@lcase/adapters/eval-result-repository";
import {
  ArtifactService,
  EvalService,
  FlowService,
  ReplayService,
  RunService,
  SimService,
} from "@lcase/app-services";
import type { ServicesPort } from "@lcase/ports";
import type { ObservabilityTapPort } from "@lcase/ports";
import { managedResource, type ManagedRuntime } from "@lcase/assembly";
import { assembleEmbeddedSystem } from "./assemble-embedded-system.js";
import {
  engineJobTerminalSubscription,
  jobCatalog,
  jobCommandTopic,
  jobTerminalTopic,
  observabilityJobSubscription,
  workerJobCommandSubscription,
} from "@lcase/message-topology/catalogs";
import { hostPlanFor, resolveHostPlan } from "@lcase/message-topology";
import { localSystemRole } from "@lcase/message-topology/deployments";
import { manifestFor } from "./select-manifest.js";
import { buildMessageRouter } from "./build-message-router.js";
import { buildWorker } from "./build-worker.js";
import { buildArtifactStore } from "./build-artifact-store.js";
import { buildObservability } from "./build-observability.js";
import { buildEngine } from "./build-engine.js";
import { buildSqlClient } from "./build-sql-client.js";
import type { LocalSystemConfig } from "./config/local-system.config.js";

export type LocalSystem = {
  services: ServicesPort;
  runtime: ManagedRuntime;
  tap: ObservabilityTapPort;
};

// A clean rewrite of composition, not a retrofit of createServices()/
// createRuntime() -- see docs/initiatives/swappable-infrastructure/arcs/
// cas-adapter.md's the related change discussion. packages/app-services stays untouched;
// this just constructs those same classes against freshly-assembled
// instances instead of reusing any of the old wiring functions, factories,
// or registries.
export function createLocalSystem(config: LocalSystemConfig): LocalSystem {
  const bus = new InMemoryEventBus();
  const ef = new EmitterFactory(bus);

  const jobParser = new JobParser(eventSchemaRegistry);

  // One client for the process, selected by config. Every repository below
  // shares it, including the two the projection sinks write through -- which is
  // the property that used to be impossible, because a module-global client
  // built from an environment variable at import time was the only one there
  // was.
  const { client: sql, hooks: sqlHooks } = buildSqlClient(config.sql);

  const artifactRepository = new PrismaArtifactRepository(sql);
  const flowRepository = new PrismaFlowRepository(sql);
  const runRepository = new PrismaRunRepository(sql);
  const runQuery = new PrismaRunQuery(sql, artifactRepository);
  const simRepository = new PrismaSimRepository(sql);
  const runStepProjectionRepository = new PrismaRunStepProjectionRepository(
    sql,
  );
  const evalResultRepository = new PrismaEvalResultRepository(sql);

  const artifactStore = buildArtifactStore(config.artifacts);
  const artifacts = createArtifactReadWritePort(
    artifactStore,
    artifactRepository,
  );

  // Declare, resolve, build, bind, seal -- in that order, because the graph is
  // cyclic: worker's handler needs the terminal publisher the router hands
  // out, while the router needs worker's handler to route to. The router
  // enforces this itself (publishing before seal, binding after it, binding
  // something the topology never declared, and a declared subscription nobody
  // bound all throw), which is why the sequence is written here in the
  // composition root rather than hidden behind a helper.
  //
  // Which carrier moves the Messages is config's business and appears nowhere
  // below: the declarations, the bindings, and the components are identical
  // either way.
  // Deployment, then this role's slice of it, then that slice joined to the
  // conversations this process imported. The manifest describes every
  // cooperating role; the plan is only ours, which is what a second host would
  // derive from the same manifest without either naming the other.
  //
  // The role id is this profile's identity, not configuration. A Worker host is
  // a different profile naming `workerHost`, rather than this one with a flag.
  const manifest = manifestFor(config.messaging.kind);
  const plan = resolveHostPlan(
    hostPlanFor(manifest, localSystemRole.id),
    jobCatalog,
  );
  const { router, hooks: routerHooks } = buildMessageRouter(
    config.messaging,
    plan,
  );
  const jobCommands = router.publisher(jobCommandTopic);
  const jobTerminals = router.publisher(jobTerminalTopic);

  // Retained as the worker, not as a capability it happens to satisfy: nothing
  // holds a reference to it in order to call it. It is here so its handler can
  // be bound, and so it stays alive.
  const worker = buildWorker(
    { artifacts, terminal: jobTerminals },
    config.worker,
  );

  const engine = buildEngine(
    bus,
    ef,
    jobParser,
    runQuery,
    artifacts,
    jobCommands,
  );

  const { tap, sinks } = buildObservability(
    config.observability,
    bus,
    artifacts,
    runQuery,
    {
      runs: runRepository,
      steps: runStepProjectionRepository,
      evalResults: evalResultRepository,
    },
  );

  router.bind({
    subscription: workerJobCommandSubscription,
    handler: worker.handleHttpJsonSubmitted,
    // Worker's own capacity bound still applies underneath this. The two are
    // not redundant: this bounds what one mailbox presents, and worker's bounds
    // the component however work arrives.
    maxInFlight: config.worker.maxConcurrentJobs,
  });
  router.bind({
    subscription: engineJobTerminalSubscription,
    handler: engine.handleJobTerminal,
  });
  router.bind({
    subscription: observabilityJobSubscription,
    // One binding across both topics, so the command and the terminal it
    // produced reach the tap through one lane in the order they arrived rather
    // than racing in two. A closure only to keep `ingest` bound to its tap --
    // it owns no policy, state, or translation of its own.
    handler: (message) => tap.ingest(message),
    // Explicit rather than left to the default, because this is the half of the
    // ordering guarantee that lives here. The deployment routes both topics
    // onto one path, which is what makes arrival order meaningful; running one
    // handler at a time is what carries that order into the tap. Raising this
    // would keep the arrival order and lose the observed one.
    maxInFlight: 1,
  });

  // Nothing can add a route after this point, and nothing published before it
  // would have been delivered.
  router.seal();

  const cl = new ConcurrencyLimiter(bus, ef);
  const limiter = new Limiter(config.limiter.id, config.limiter.scope, {
    bus,
    ef,
    cl,
  });

  const replay = new ReplayEngine(
    new JsonlEventLog(path.resolve(process.cwd(), "lcase-db/replay")),
    bus,
    ef,
  );

  const runtime = assembleEmbeddedSystem({
    // First to start and last to stop: the projection sinks write through this
    // client, so disconnecting it before they stop would drop their final
    // writes.
    sql: managedResource("sql", sql, sqlHooks),
    bus: managedResource("bus", bus, {
      stop: async (b) => {
        await b.close();
      },
    }),
    sinks: Object.entries(sinks).map(([id, sink]) =>
      managedResource(id, sink, {
        start: (s) => s.start(),
        stop: (s) => s.stop(),
      }),
    ),
    tap: managedResource("tap", tap, {
      start: (t) => t.start(),
      stop: (t) => t.stop(),
    }),
    engine: managedResource("engine", engine, {
      start: (e) => e.start(),
      stop: (e) => e.stop(),
    }),
    limiter: managedResource("limiter", limiter, {
      start: (l) => l.start(),
      stop: (l) => l.stop(),
    }),
    // Hooks come from the carrier: none for in-process, read loops and
    // connections for a log-backed one.
    router: managedResource("router", router, routerHooks),
  });

  const flow = new FlowService(artifacts, flowRepository);
  const replayService = new ReplayService(replay);
  const sim = new SimService(
    artifacts,
    ef,
    runQuery,
    simRepository,
    flowRepository,
  );
  const run = new RunService({
    artifactRepository,
    artifacts,
    ef,
    runRepository,
    runQuery,
  });
  const artifact = new ArtifactService(
    artifacts,
    artifactRepository,
    flowRepository,
  );
  const evalService = new EvalService({
    runService: run,
    runQuery,
    runRepository,
    artifacts,
    evalResults: evalResultRepository,
  });

  const services: ServicesPort = {
    flow,
    replay: replayService,
    sim,
    run,
    artifact,
    eval: evalService,
  };

  return { services, runtime, tap };
}
