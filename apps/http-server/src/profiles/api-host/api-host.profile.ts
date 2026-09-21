import path from "node:path";
import { InMemoryEventBus } from "@lcase/adapters/event-bus";
import { JsonlEventLog } from "@lcase/adapters/event-store";
import { PrismaArtifactRepository } from "@lcase/adapters/artifact-repository";
import { PrismaEvalResultRepository } from "@lcase/adapters/eval-result-repository";
import { PrismaFlowRepository } from "@lcase/adapters/flow-repository";
import { PrismaRunQuery } from "@lcase/adapters/run-query";
import { PrismaRunRepository } from "@lcase/adapters/run-repository";
import { PrismaRunStepProjectionRepository } from "@lcase/adapters/run-step-projection-repository";
import { PrismaSimRepository } from "@lcase/adapters/sim-repository";
import { InMemoryRunSettledNotifier } from "@lcase/adapters/run-settled";
import {
  ArtifactService,
  EvalService,
  FlowService,
  ReplayService,
  RunService,
  SimService,
} from "@lcase/app-services";
import { createArtifactReadWritePort } from "@lcase/artifacts";
import { managedResource, type ManagedRuntime } from "@lcase/assembly";
import { EmitterFactory, eventSchemaRegistry } from "@lcase/events";
import { JobParser } from "@lcase/events/parsers";
import { jobCommandTopic } from "@lcase/message-topology/catalogs";
import type { ObservabilityTapPort, ServicesPort } from "@lcase/ports";
import { ReplayEngine } from "@lcase/replay";
import { assembleApiHost } from "./assemble-api-host.js";
import { bindSubscriptions } from "./bind-subscriptions.js";
import { buildArtifactStore } from "./build-artifact-store.js";
import { buildEngine } from "./build-engine.js";
import { buildMessageRouter } from "./build-message-router.js";
import { buildObservability } from "./build-observability.js";
import { buildSqlClient } from "./build-sql-client.js";
import { apiHostPlan } from "./host-plan.js";
import type { ApiHostConfig } from "./api-host.config.js";

export type ApiHost = {
  services: ServicesPort;
  runtime: ManagedRuntime;
  tap: ObservabilityTapPort;
};

/**
 * This host's composition root: the object graph for a process that serves the
 * HTTP API and runs Engine and Observability, with Worker somewhere else.
 *
 * It returns the same three things the embedded profile does, because the HTTP
 * layer above it cannot tell the two apart -- which is the property that let the
 * service layer come across unchanged.
 *
 * App-local on purpose. The role it composes holds Engine and Observability
 * alongside the API, and the distributed shape actually wanted holds neither,
 * so a package here would fix a boundary around a waypoint. See the deployment
 * shapes in docs/initiatives/swappable-infrastructure/INITIATIVE.md.
 */
export function createApiHost(config: ApiHostConfig): ApiHost {
  // Still an in-process bus, and that is the honest statement of what has and
  // has not moved. Run ingress is not a conversation yet: `runFlow()` emits
  // `run.requested` onto this bus and Engine subscribes to it there, and
  // Observability taps the same bus for everything that never became a Message.
  // Moving Engine out is what would force those families onto the router, and
  // that is a different deployment rather than a variant of this one.
  const bus = new InMemoryEventBus();
  const ef = new EmitterFactory(bus);

  const jobParser = new JobParser(eventSchemaRegistry);

  // One client for the process, shared by every repository below, including the
  // two the projection sinks write through.
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

  const { store: artifactStore, hooks: artifactStoreHooks } =
    buildArtifactStore(config.artifacts);
  const artifacts = createArtifactReadWritePort(
    artifactStore,
    artifactRepository,
  );

  // Declare, resolve, build, bind, seal -- in that order, for the same reason
  // the other two profiles give: the router needs the handlers it routes to,
  // and Engine needs the publisher the router hands out.
  //
  // This host publishes commands and never terminals. The publisher it takes is
  // the whole of what it knows about the Worker process: a topic identity and a
  // route, with no indication that anything consumes either.
  const plan = apiHostPlan();
  const { router, hooks: routerHooks } = buildMessageRouter(
    config.messaging,
    plan,
  );
  const jobCommands = router.publisher(jobCommandTopic);

  const engine = buildEngine(
    bus,
    ef,
    jobParser,
    runQuery,
    artifacts,
    jobCommands,
  );

  const runSettled = new InMemoryRunSettledNotifier();
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
    runSettled,
  );

  bindSubscriptions(router, engine, tap);

  // Nothing can add a route after this point, and nothing published before it
  // would have been delivered.
  router.seal();

  const replay = new ReplayEngine(
    new JsonlEventLog(path.resolve(process.cwd(), "lcase-db/replay")),
    bus,
    ef,
  );

  const runtime = assembleApiHost({
    sql: managedResource("sql", sql, sqlHooks),
    artifacts: managedResource("artifacts", artifactStore, artifactStoreHooks),
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
    runSettled,
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
