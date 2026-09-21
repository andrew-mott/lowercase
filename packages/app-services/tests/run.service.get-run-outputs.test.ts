import { describe, expect, it, vi } from "vitest";
import type {
  ArtifactReaderPort,
  ArtifactRepositoryPort,
  RunQueryPort,
} from "@lcase/ports";
import type {
  ArtifactIndex,
  FlowDefinition,
  RunRecord,
  RunStepProjectionRecord,
} from "@lcase/types";
import { RunService } from "../src/run.service.js";
import { makeEmitterFactory } from "./helpers/make-run-service.js";

const flow: FlowDefinition = {
  name: "Outputs",
  version: "v1",
  start: "a",
  steps: {
    a: { type: "http", url: "http://localhost/a" },
    b: { type: "http", url: "http://localhost/b" },
  },
  outputs: {
    first: { payload: "{{steps.a.output}}" },
    second: { payload: "{{steps.b.output}}" },
  },
};

const step = (
  stepId: string,
  fields: Partial<RunStepProjectionRecord> = {},
): RunStepProjectionRecord => ({
  runId: "run-1",
  stepId,
  status: "success",
  ...fields,
});

const meta = (
  hash: string,
  contentType: string,
  size: number,
): ArtifactIndex => ({ hash, contentType, size, time: "2026-07-02T10:00:00Z" });

type Stored = { contentType: string; value: unknown };

function makeService(options: {
  status?: RunRecord["status"];
  steps?: RunStepProjectionRecord[];
  metadata?: ArtifactIndex[];
  store?: Record<string, Stored>;
  flowLoads?: boolean;
  detailError?: string;
}) {
  const runQuery = {
    getRunDetail: vi.fn().mockResolvedValue(
      options.detailError
        ? { ok: false, error: options.detailError }
        : {
            ok: true,
            value: {
              run: {
                id: "run-1",
                status: options.status ?? "completed",
                flowDefHash: "flow-hash",
              },
              steps: options.steps ?? [],
            },
          },
    ),
  } as unknown as RunQueryPort;

  const artifacts = {
    load: vi.fn().mockImplementation(async (hash: string) => {
      if (hash === "flow-hash" && options.flowLoads !== false) {
        return { ok: true, value: flow };
      }
      const stored = options.store?.[hash];
      if (stored) return { ok: true, ...stored };
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "missing" },
      };
    }),
  } as unknown as ArtifactReaderPort;

  const artifactRepository = {
    getArtifacts: vi.fn().mockResolvedValue(options.metadata ?? []),
  } as unknown as ArtifactRepositoryPort;

  const service = new RunService({
    artifactRepository,
    artifacts,
    ef: makeEmitterFactory(),
    runRepository: {} as never,
    runQuery,
    runSettled: {} as never,
  });
  return { service, artifacts };
}

const loadedHashes = (artifacts: ArtifactReaderPort) =>
  vi
    .mocked(artifacts.load)
    .mock.calls.map(([hash]) => hash)
    .filter((hash) => hash !== "flow-hash");

describe("RunService.getRunOutputs", () => {
  it.each(["requested", "started"] as const)(
    "refuses a run that is %s",
    async (status) => {
      const { service } = makeService({ status });

      const result = await service.getRunOutputs("run-1");

      expect(result).toEqual({
        ok: false,
        error: `Run has not finished (status: ${status})`,
      });
    },
  );

  it("passes through an unknown run's error", async () => {
    const { service } = makeService({ detailError: "Run not found" });

    expect(await service.getRunOutputs("run-1")).toEqual({
      ok: false,
      error: "Run not found",
    });
  });

  it("inlines small json and text and leaves binary and oversized content to a fetch by hash", async () => {
    const { service, artifacts } = makeService({
      steps: [
        step("a", { outputHash: "hash-json" }),
        step("b", { outputHash: "hash-audio" }),
      ],
      metadata: [
        meta("hash-json", "application/json", 12),
        meta("hash-audio", "audio/wav", 88044),
      ],
      store: {
        "hash-json": { contentType: "application/json", value: { text: "hi" } },
      },
    });

    const result = await service.getRunOutputs("run-1");

    expect(result).toEqual({
      ok: true,
      value: {
        first: {
          ok: true,
          hash: "hash-json",
          contentType: "application/json",
          size: 12,
          payload: { text: "hi" },
        },
        second: {
          ok: true,
          hash: "hash-audio",
          contentType: "audio/wav",
          size: 88044,
        },
      },
    });
    expect(loadedHashes(artifacts)).toEqual(["hash-json"]);
  });

  it("inlines text content", async () => {
    const { service } = makeService({
      steps: [step("a", { outputHash: "hash-text" })],
      metadata: [meta("hash-text", "text/plain", 5)],
      store: { "hash-text": { contentType: "text/plain", value: "hello" } },
    });

    const result = await service.getRunOutputs("run-1");

    expect(result.ok && result.value.first).toEqual({
      ok: true,
      hash: "hash-text",
      contentType: "text/plain",
      size: 5,
      payload: "hello",
    });
  });

  it("does not load or inline text over the size cap", async () => {
    const { service, artifacts } = makeService({
      steps: [step("a", { outputHash: "hash-big" })],
      metadata: [meta("hash-big", "text/plain", 1024 * 1024 + 1)],
    });

    const result = await service.getRunOutputs("run-1");

    expect(result.ok && result.value.first).toEqual({
      ok: true,
      hash: "hash-big",
      contentType: "text/plain",
      size: 1024 * 1024 + 1,
    });
    expect(loadedHashes(artifacts)).toEqual([]);
  });

  it("reports an output that was not produced or whose step failed", async () => {
    const { service } = makeService({
      steps: [step("b", { status: "failure" })],
    });

    const result = await service.getRunOutputs("run-1");

    expect(result).toEqual({
      ok: true,
      value: {
        first: { ok: false, error: "not-produced" },
        second: { ok: false, error: "step-failed" },
      },
    });
  });

  it("returns the outputs of a failed run", async () => {
    const { service } = makeService({
      status: "failed",
      steps: [
        step("a", { outputHash: "hash-audio" }),
        step("b", { status: "failure" }),
      ],
      metadata: [meta("hash-audio", "audio/wav", 10)],
    });

    const result = await service.getRunOutputs("run-1");

    expect(result.ok && result.value).toMatchObject({
      first: { ok: true, hash: "hash-audio" },
      second: { ok: false, error: "step-failed" },
    });
  });

  it("takes content type and size from the store when the metadata row is missing", async () => {
    const { service } = makeService({
      steps: [
        step("a", { outputHash: "hash-text" }),
        step("b", { outputHash: "hash-audio" }),
      ],
      store: {
        "hash-text": { contentType: "text/plain", value: "hello" },
        "hash-audio": {
          contentType: "audio/wav",
          value: new Uint8Array([1, 2, 3]),
        },
      },
    });

    const result = await service.getRunOutputs("run-1");

    expect(result).toEqual({
      ok: true,
      value: {
        first: {
          ok: true,
          hash: "hash-text",
          contentType: "text/plain",
          size: 5,
          payload: "hello",
        },
        second: {
          ok: true,
          hash: "hash-audio",
          contentType: "audio/wav",
          size: 3,
        },
      },
    });
  });

  it("omits the size of json whose metadata row is missing", async () => {
    const { service } = makeService({
      steps: [step("a", { outputHash: "hash-json" })],
      store: {
        "hash-json": { contentType: "application/json", value: { a: 1 } },
      },
    });

    const result = await service.getRunOutputs("run-1");

    expect(result.ok && result.value.first).toEqual({
      ok: true,
      hash: "hash-json",
      contentType: "application/json",
      payload: { a: 1 },
    });
  });

  it("fails the request when an output cannot be read from the store", async () => {
    const { service } = makeService({
      steps: [step("a", { outputHash: "hash-gone" })],
    });

    const result = await service.getRunOutputs("run-1");

    expect(result).toEqual({
      ok: false,
      error: "Unable to load output artifact hash-gone: missing",
    });
  });

  it("fails the request when the flow definition cannot be loaded", async () => {
    const { service } = makeService({ flowLoads: false });

    const result = await service.getRunOutputs("run-1");

    expect(result.ok).toBe(false);
  });
});
