import { vi } from "vitest";
import { RunService } from "../../src/run.service.js";
import type {
  ArtifactRepositoryPort,
  ArtifactReaderPort,
  EmitterFactoryPort,
  RunQueryPort,
  RunRepositoryPort,
} from "@lcase/ports";
import type { FlowDefinition, RunEvent } from "@lcase/types";

export function makeEmitterFactory() {
  const emit = vi.fn().mockResolvedValue({} as RunEvent<"run.requested">);
  return {
    generateTraceId: () => "trace-id",
    generateSpanId: () => "span-id",
    makeTraceParent: () => "trace-parent",
    newRunEmitter: () => ({ emit }),
  } as unknown as EmitterFactoryPort;
}

export function makeRunService(options?: {
  flow?: FlowDefinition;
  artifact?: {
    contentType?: string;
    format?: "json" | "text" | "markdown" | "bytes";
  };
}) {
  const flow =
    options?.flow ??
    ({
      name: "Prompt Flow",
      version: "v1",
      params: {
        prompt: { type: "text/markdown" },
      },
      start: "fetch",
      steps: {
        fetch: {
          type: "httpjson",
          url: "{{params.prompt}}",
        },
      },
    } satisfies FlowDefinition);

  const artifacts = {
    load: vi.fn().mockImplementation(async (hash: string) => {
      if (hash === "flow-hash") {
        return { ok: true as const, value: flow };
      }
      return {
        ok: false as const,
        error: { code: "STORE_GET_FAILED" as const, message: "missing" },
      };
    }),
  } as unknown as ArtifactReaderPort;

  const artifactRepository = {
    getArtifact: vi.fn().mockResolvedValue({
      hash: "artifact-hash",
      time: new Date().toISOString(),
      ...options?.artifact,
    }),
  } as unknown as ArtifactRepositoryPort;

  const runRepository = {
    createRun: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        id: "run-1",
        traceId: "trace-id",
        status: "requested",
        source: "lowercase://test",
        flowDefHash: "flow-hash",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  } as unknown as RunRepositoryPort;

  const runQuery = {} as RunQueryPort;

  return {
    service: new RunService({
      artifactRepository,
      artifacts,
      ef: makeEmitterFactory(),
      runRepository,
      runQuery,
    }),
    artifacts,
    artifactRepository,
    runRepository,
  };
}
