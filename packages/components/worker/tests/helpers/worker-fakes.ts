import type { MessagePublisher } from "@lcase/ports";
import type { JobRunnerConfig, JobRunnerDeps } from "../../src/job-runner.js";
import { JobRunner } from "../../src/job-runner.js";
import type {
  ProtocolResult,
  ResolvedProtocolRequest,
} from "../../src/protocol/protocol-executor.types.js";
import type { ResourceKeyResolver } from "../../src/resource-key-resolver.js";
import type {
  JobTerminalMessage,
  JobTerminalType,
} from "../../src/terminal-message.js";
import type { WorkerConfig, WorkerDeps } from "../../src/worker.js";
import { Worker } from "../../src/worker.js";
import { createFakeArtifactReaderPort } from "./fake-artifact-reader.js";
import { createFakeArtifactWriterPort } from "./fake-artifact-writer.js";
import { createFakeLifecycleSink } from "./fake-lifecycle-sink.js";
import { createFakeProtocolExecutor } from "./fake-protocol-executor.js";
import { createFakePermitPort } from "./fake-resource-permit.js";

export const WORKER_SOURCE = "lowercase://worker/test";

export const GENEROUS_CONFIG: WorkerConfig = {
  maxConcurrentJobs: 10,
  protocolTimeoutMs: 5_000,
  source: WORKER_SOURCE,
};

// Records what worker published rather than routing it anywhere: these tests
// are about worker's boundary, not delivery.
export function createFakeTerminalPublisher() {
  const published: JobTerminalMessage[] = [];
  let reject: Error | undefined;
  return {
    published,
    failNextPublish(err: Error) {
      reject = err;
    },
    publisher: {
      publish: async (message: JobTerminalMessage) => {
        if (reject) {
          const err = reject;
          reject = undefined;
          throw err;
        }
        published.push(message);
      },
    } satisfies MessagePublisher<JobTerminalType>,
  };
}

type PermitFakes = ReturnType<typeof createFakePermitPort>;

export type WorkerFakeOverrides = {
  protocolResult?: (
    request: ResolvedProtocolRequest,
  ) => ProtocolResult | Promise<ProtocolResult>;
  permits?: PermitFakes;
  resourceKeyResolver?: ResourceKeyResolver;
};

// Every test in this package needs the same five collaborators, which is
// where most of the old single test file's length went. `runnerDeps()` and
// `workerDeps()` are functions rather than fields so a test can spy on a fake
// (notably `writer.save`) before the deps object captures it.
export function makeWorkerFakes(overrides: WorkerFakeOverrides = {}) {
  const { sink, events } = createFakeLifecycleSink();
  const permits = overrides.permits ?? createFakePermitPort();
  const { reader, seed } = createFakeArtifactReaderPort();
  const { writer, store } = createFakeArtifactWriterPort();
  const { executor, execute: protocolExecute } = createFakeProtocolExecutor(
    overrides.protocolResult ?? (() => ({ ok: true, payload: null })),
  );

  function runnerDeps(): JobRunnerDeps {
    return {
      permits: permits.port,
      protocol: executor,
      artifacts: { ...reader, ...writer },
      ...(overrides.resourceKeyResolver
        ? { resourceKeyResolver: overrides.resourceKeyResolver }
        : {}),
    };
  }

  const terminal = createFakeTerminalPublisher();

  function workerDeps(): WorkerDeps {
    return { ...runnerDeps(), lifecycle: sink, terminal: terminal.publisher };
  }

  return {
    runnerDeps,
    workerDeps,
    events,
    terminal,
    published: terminal.published,
    acquire: permits.acquire,
    release: permits.release,
    protocolExecute,
    writer,
    store,
    seed,
  };
}

export function makeJobRunner(
  overrides: WorkerFakeOverrides & Partial<JobRunnerConfig> = {},
) {
  const fakes = makeWorkerFakes(overrides);
  const runner = new JobRunner(fakes.runnerDeps(), {
    protocolTimeoutMs:
      overrides.protocolTimeoutMs ?? GENEROUS_CONFIG.protocolTimeoutMs,
  });
  return { runner, ...fakes };
}

export function makeWorker(
  overrides: WorkerFakeOverrides & Partial<WorkerConfig> = {},
) {
  const fakes = makeWorkerFakes(overrides);
  const worker = new Worker(fakes.workerDeps(), {
    maxConcurrentJobs:
      overrides.maxConcurrentJobs ?? GENEROUS_CONFIG.maxConcurrentJobs,
    protocolTimeoutMs:
      overrides.protocolTimeoutMs ?? GENEROUS_CONFIG.protocolTimeoutMs,
    source: overrides.source ?? GENEROUS_CONFIG.source,
  });
  return { worker, ...fakes };
}
