import { describe, expect, it, vi } from "vitest";
import { RunService } from "../src/run.service.js";
import type {
  ArtifactRepositoryPort,
  ArtifactReaderPort,
  RunQueryPort,
  RunRepositoryPort,
} from "@lcase/ports";
import {
  makeEmitterFactory,
  makeRunService,
} from "./helpers/make-run-service.js";

describe("RunService", () => {
  it("accepts compatible markdown param artifacts", async () => {
    const { service, runRepository } = makeRunService({
      artifact: {
        contentType: "text/markdown",
        format: "markdown",
      },
    });

    await expect(
      service.requestRun({
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "flow-hash",
        source: "lowercase://test",
        runId: "run-1",
        params: {
          prompt: "artifact-hash",
        },
      }),
    ).resolves.toBeUndefined();

    expect(runRepository.createRun).toHaveBeenCalledOnce();
    expect(runRepository.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ params: { prompt: "artifact-hash" } }),
    );
  });

  it("rejects incompatible param artifact formats", async () => {
    const { service } = makeRunService({
      artifact: {
        contentType: "application/json",
        format: "json",
      },
    });

    await expect(
      service.requestRun({
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "flow-hash",
        source: "lowercase://test",
        runId: "run-1",
        params: {
          prompt: "artifact-hash",
        },
      }),
    ).rejects.toThrow(
      "Run param prompt requires text/markdown, received application/json",
    );
  });

  it("rejects nested refs for string-backed params", async () => {
    const { service } = makeRunService({
      artifact: {
        contentType: "text/markdown",
        format: "markdown",
      },
      flow: {
        name: "Prompt Flow",
        version: "v1",
        params: {
          prompt: { type: "text/plain" },
        },
        start: "fetch",
        steps: {
          fetch: {
            type: "httpjson",
            url: "{{params.prompt.answer}}",
          },
        },
      },
    });

    await expect(
      service.requestRun({
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "flow-hash",
        source: "lowercase://test",
        runId: "run-1",
        params: {
          prompt: "artifact-hash",
        },
      }),
    ).rejects.toThrow(
      "String-backed run param refs must target the whole value: params.prompt.answer",
    );
  });

  it("rejects a nested ref into a string-backed step export", async () => {
    const { service } = makeRunService({
      flow: {
        name: "Export Flow",
        version: "v1",
        start: "upstream",
        steps: {
          upstream: {
            type: "httpjson",
            url: "url",
            exports: {
              summary: { ref: "{{output.message}}", type: "text/plain" },
            },
            on: { success: "downstream" },
          },
          downstream: {
            type: "httpjson",
            url: "{{steps.upstream.exports.summary.nested}}",
          },
        },
      },
    });

    await expect(
      service.requestRun({
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "flow-hash",
        source: "lowercase://test",
        runId: "run-1",
      }),
    ).rejects.toThrow(/Invalid step reference\(s\)/);
  });

  it("still accepts a compatible flow after the export-validation addition", async () => {
    const { service, runRepository } = makeRunService({
      artifact: {
        contentType: "text/markdown",
        format: "markdown",
      },
    });

    await expect(
      service.requestRun({
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "flow-hash",
        source: "lowercase://test",
        runId: "run-1",
        params: {
          prompt: "artifact-hash",
        },
      }),
    ).resolves.toBeUndefined();

    expect(runRepository.createRun).toHaveBeenCalledOnce();
  });

  it("listRunsByFlowVersionId passes through to runQuery.listByFlowVersionId", async () => {
    const runListItem = { runId: "run-1" } as unknown as Awaited<
      ReturnType<RunQueryPort["listByFlowVersionId"]>
    >[number];
    const runQuery = {
      listByFlowVersionId: vi.fn().mockResolvedValue([runListItem]),
    } as unknown as RunQueryPort;

    const service = new RunService({
      artifactRepository: {} as ArtifactRepositoryPort,
      artifacts: {} as ArtifactReaderPort,
      ef: makeEmitterFactory(),
      runRepository: {} as RunRepositoryPort,
      runQuery,
      runSettled: {} as never,
    });

    const result = await service.listRunsByFlowVersionId("flow-version-1");

    expect(runQuery.listByFlowVersionId).toHaveBeenCalledWith("flow-version-1");
    expect(result).toEqual([runListItem]);
  });

  it("getRunParams maps a run's param selections into a name->hash manifest", async () => {
    const runQuery = {
      getRunDetail: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          run: {},
          steps: [],
          params: [
            { name: "prompt", artifactHash: "hash-prompt" },
            { name: "topic", artifactHash: "hash-topic" },
          ],
        },
      }),
    } as unknown as RunQueryPort;

    const service = new RunService({
      artifactRepository: {} as ArtifactRepositoryPort,
      artifacts: {} as ArtifactReaderPort,
      ef: makeEmitterFactory(),
      runRepository: {} as RunRepositoryPort,
      runQuery,
      runSettled: {} as never,
    });

    const result = await service.getRunParams("run-1");

    expect(runQuery.getRunDetail).toHaveBeenCalledWith("run-1");
    expect(result).toEqual({
      ok: true,
      value: { prompt: "hash-prompt", topic: "hash-topic" },
    });
  });

  it("getRunParams returns an empty manifest when the run had no params", async () => {
    const runQuery = {
      getRunDetail: vi.fn().mockResolvedValue({
        ok: true,
        value: { run: {}, steps: [], params: [] },
      }),
    } as unknown as RunQueryPort;

    const service = new RunService({
      artifactRepository: {} as ArtifactRepositoryPort,
      artifacts: {} as ArtifactReaderPort,
      ef: makeEmitterFactory(),
      runRepository: {} as RunRepositoryPort,
      runQuery,
      runSettled: {} as never,
    });

    const result = await service.getRunParams("run-1");

    expect(result).toEqual({ ok: true, value: {} });
  });

  it("getRunParams passes through a getRunDetail error", async () => {
    const runQuery = {
      getRunDetail: vi.fn().mockResolvedValue({
        ok: false,
        error: "Run not found",
      }),
    } as unknown as RunQueryPort;

    const service = new RunService({
      artifactRepository: {} as ArtifactRepositoryPort,
      artifacts: {} as ArtifactReaderPort,
      ef: makeEmitterFactory(),
      runRepository: {} as RunRepositoryPort,
      runQuery,
      runSettled: {} as never,
    });

    const result = await service.getRunParams("run-missing");

    expect(result).toEqual({ ok: false, error: "Run not found" });
  });
});
