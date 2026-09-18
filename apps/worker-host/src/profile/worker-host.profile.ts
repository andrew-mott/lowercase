import { PrismaArtifactRepository } from "@lcase/adapters/artifact-repository";
import { createArtifactReadWritePort } from "@lcase/artifacts";
import { managedResource, type ManagedRuntime } from "@lcase/assembly";
import { assembleWorkerHost } from "./assemble-worker-host.js";
import { createConsoleWorkerLifecycleEventSink } from "@lcase/worker";
import { jobTerminalTopic } from "@lcase/message-topology/catalogs";
import { bindSubscriptions } from "./bind-subscriptions.js";
import { buildArtifactStore } from "./build-artifact-store.js";
import { buildWorker } from "./build-worker.js";
import { buildMessageRouter } from "./build-message-router.js";
import { buildSqlClient } from "./build-sql-client.js";
import { workerHostPlan } from "../host-plan.js";
import type { WorkerHostConfig } from "./worker-host.config.js";

export type WorkerHost = {
  runtime: ManagedRuntime;
};

/**
 * This host's composition root: the object graph for a process that runs Worker
 * and nothing else.
 *
 * It returns only a runtime. Nothing calls into a Worker host -- it is driven
 * entirely by Messages arriving on the subscription it binds -- so there is no
 * service surface to hand back.
 */
export function createWorkerHost(config: WorkerHostConfig): WorkerHost {
  // One client for the process, shared by every repository built from it.
  const { client: sql, hooks: sqlHooks } = buildSqlClient(config.sql);

  // The only repository this host builds. `createArtifactReadWritePort` is
  // Worker's entire storage surface, so no run, flow, sim, eval or projection
  // repository belongs in this process.
  const artifactRepository = new PrismaArtifactRepository(sql);
  const { store: artifactStore, hooks: artifactStoreHooks } =
    buildArtifactStore(config.artifacts);
  const artifacts = createArtifactReadWritePort(
    artifactStore,
    artifactRepository,
  );

  // Declare, resolve, build, bind, seal -- in that order, because the graph is
  // cyclic: Worker's handler needs the terminal publisher the router hands out,
  // while the router needs Worker's handler to route to.
  //
  // The role id is this profile's identity, not configuration. Resolving the
  // manifest takes no config axis because this host can only be one role of one
  // deployment.
  const plan = workerHostPlan();
  const { router, hooks: routerHooks } = buildMessageRouter(
    config.messaging,
    plan,
  );
  const jobTerminals = router.publisher(jobTerminalTopic);

  // Retained as the worker, not as a capability it happens to satisfy: nothing
  // holds a reference to it in order to call it. It is here so its handler can
  // be bound, and so it stays alive.
  const worker = buildWorker(
    {
      artifacts,
      terminal: jobTerminals,
      lifecycle: createConsoleWorkerLifecycleEventSink(),
    },
    config.worker,
  );

  bindSubscriptions(router, worker, config.worker);

  // Nothing can add a route after this point, and nothing published before it
  // would have been delivered.
  router.seal();

  const runtime = assembleWorkerHost({
    sql: managedResource("sql", sql, sqlHooks),
    artifacts: managedResource("artifacts", artifactStore, artifactStoreHooks),
    router: managedResource("router", router, routerHooks),
  });

  return { runtime };
}
