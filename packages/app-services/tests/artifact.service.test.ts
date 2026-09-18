import { describe, expect, it, vi } from "vitest";
import { ArtifactService } from "../src/artifact.service.js";
import type {
  ArtifactRepositoryPort,
  ArtifactReadWritePort,
  FlowRepositoryPort,
} from "@lcase/ports";
import type { ArtifactIndex, FlowDefinition } from "@lcase/types";

function makeArtifactService(options?: {
  flow?: FlowDefinition;
  artifact?: ArtifactIndex;
  updateMetadata?: ReturnType<typeof vi.fn>;
  save?: ReturnType<typeof vi.fn>;
}) {
  const flow =
    options?.flow ??
    ({
      name: "Weather Flow",
      version: "v1",
      params: {
        weatherApiKey: { type: "text/plain" },
      },
      start: "fetch",
      steps: {
        fetch: { type: "httpjson", url: "https://example.com" },
      },
    } satisfies FlowDefinition);

  const artifact: ArtifactIndex = options?.artifact ?? {
    hash: "artifact-hash",
    time: new Date().toISOString(),
    contentType: "text/plain",
    format: "text",
    curated: false,
  };

  const artifacts = {
    load: vi.fn().mockResolvedValue({ ok: true, value: flow }),
    save:
      options?.save ??
      vi.fn().mockResolvedValue({
        status: "saved",
        hash: "new-hash",
      }),
  } as unknown as ArtifactReadWritePort;

  const artifactRepository = {
    listArtifacts: vi.fn().mockResolvedValue([]),
    getArtifact: vi.fn().mockResolvedValue(artifact),
    updateMetadata:
      options?.updateMetadata ??
      vi.fn().mockImplementation(async (hash: string) => ({
        ok: true,
        value: { hash, time: new Date().toISOString(), curated: true },
      })),
    listCuratedArtifacts: vi.fn().mockResolvedValue([]),
  } as unknown as ArtifactRepositoryPort;

  const flowRepository = {
    getFlowVersion: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        id: "version-1",
        flowId: "flow-1",
        sequence: 1,
        definitionHash: "flow-hash",
        createdAt: new Date().toISOString(),
      },
    }),
  } as unknown as FlowRepositoryPort;

  return {
    service: new ArtifactService(artifacts, artifactRepository, flowRepository),
    artifacts,
    artifactRepository,
    flowRepository,
  };
}

describe("ArtifactService.createArtifact", () => {
  it("temporarily rejects format: bytes, without writing anything", async () => {
    const { service, artifacts } = makeArtifactService();

    const result = await service.createArtifact({
      format: "bytes",
      value: new Uint8Array([1, 2, 3]),
    });

    expect(result.ok).toBe(false);
    expect(artifacts.save).not.toHaveBeenCalled();
  });

  it("forces curated: true even with no metadata at all", async () => {
    const { service, artifacts } = makeArtifactService();

    const result = await service.createArtifact({
      format: "text",
      value: "hello",
    });

    expect(result.ok).toBe(true);
    expect(artifacts.save).toHaveBeenCalledWith("hello", "text/plain", {
      curated: true,
    });
  });

  it("forces curated: true even if metadata smuggles its own curated key at runtime", async () => {
    const { service, artifacts } = makeArtifactService();

    // ArtifactUpdateMetadata never declares `curated`, but metadata arrives
    // over the wire as parsed JSON -- untyped at runtime -- so this proves
    // a client-supplied curated:false can't survive the merge
    await service.createArtifact({ format: "text", value: "hello" }, {
      curated: false,
      label: "sneaky",
    } as never);

    expect(artifacts.save).toHaveBeenCalledWith("hello", "text/plain", {
      curated: true,
      label: "sneaky",
    });
  });

  it("merges curated: true into caller-supplied metadata rather than replacing it", async () => {
    const { service, artifacts } = makeArtifactService();

    await service.createArtifact(
      { format: "text", value: "hello" },
      { flowVersionId: "version-1", paramCurations: ["weatherApiKey"] },
    );

    expect(artifacts.save).toHaveBeenCalledWith("hello", "text/plain", {
      curated: true,
      flowVersionId: "version-1",
      paramCurations: ["weatherApiKey"],
    });
  });

  it("rejects a param that isn't declared on the flow version's definition, without writing anything", async () => {
    const { service, artifacts } = makeArtifactService();

    const result = await service.createArtifact(
      { format: "text", value: "hello" },
      { flowVersionId: "version-1", paramCurations: ["undeclaredParam"] },
    );

    expect(result.ok).toBe(false);
    expect(artifacts.save).not.toHaveBeenCalled();
  });

  it("rejects a param whose declared type doesn't match the input's own format, without writing anything", async () => {
    const { service, artifacts } = makeArtifactService();

    const result = await service.createArtifact(
      { format: "json", value: { hello: "world" } }, // incompatible with "text/plain"
      { flowVersionId: "version-1", paramCurations: ["weatherApiKey"] },
    );

    expect(result.ok).toBe(false);
    expect(artifacts.save).not.toHaveBeenCalled();
  });

  it("never calls save when the flow version can't be found", async () => {
    const { service, artifacts, flowRepository } = makeArtifactService();
    (
      flowRepository.getFlowVersion as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ ok: false, error: "not found" });

    const result = await service.createArtifact(
      { format: "text", value: "hello" },
      { flowVersionId: "version-1", paramCurations: ["weatherApiKey"] },
    );

    expect(result.ok).toBe(false);
    expect(artifacts.save).not.toHaveBeenCalled();
  });

  it("fetches the full index from the repository after a successful save", async () => {
    const { service, artifactRepository } = makeArtifactService();

    const result = await service.createArtifact({
      format: "text",
      value: "hello",
    });

    expect(result.ok).toBe(true);
    expect(artifactRepository.getArtifact).toHaveBeenCalledWith("new-hash");
    if (result.ok) expect(result.value.hash).toBe("artifact-hash");
  });

  it("returns an error when the save itself fails", async () => {
    const { service } = makeArtifactService({
      save: vi.fn().mockResolvedValue({
        status: "failed",
        error: { code: "STORE_PUT_FAILED", message: "disk full" },
      }),
    });

    const result = await service.createArtifact({
      format: "text",
      value: "hello",
    });

    expect(result).toEqual({ ok: false, error: "disk full" });
  });
});

describe("ArtifactService.updateArtifactMetadata", () => {
  it("skips flow-version validation entirely when paramCurations is absent", async () => {
    const { service, flowRepository, artifactRepository } =
      makeArtifactService();

    const result = await service.updateArtifactMetadata("artifact-hash", {
      label: "just a label",
    });

    expect(result.ok).toBe(true);
    expect(flowRepository.getFlowVersion).not.toHaveBeenCalled();
    expect(artifactRepository.updateMetadata).toHaveBeenCalledWith(
      "artifact-hash",
      { label: "just a label" },
    );
  });

  it("rejects a param that isn't declared on the flow version's definition", async () => {
    const { service, artifactRepository } = makeArtifactService();

    const result = await service.updateArtifactMetadata("artifact-hash", {
      flowVersionId: "version-1",
      paramCurations: ["undeclaredParam"],
    });

    expect(result.ok).toBe(false);
    expect(artifactRepository.updateMetadata).not.toHaveBeenCalled();
  });

  it("rejects a param whose declared type doesn't match the artifact's contentType", async () => {
    const { service, artifactRepository } = makeArtifactService({
      artifact: {
        hash: "artifact-hash",
        time: new Date().toISOString(),
        contentType: "application/json", // incompatible with the declared "text/plain" param
        format: "json",
        curated: false,
      },
    });

    const result = await service.updateArtifactMetadata("artifact-hash", {
      flowVersionId: "version-1",
      paramCurations: ["weatherApiKey"],
    });

    expect(result.ok).toBe(false);
    expect(artifactRepository.updateMetadata).not.toHaveBeenCalled();
  });

  it("calls the repository once with the full metadata object when validation passes", async () => {
    const { service, artifactRepository } = makeArtifactService();

    const result = await service.updateArtifactMetadata("artifact-hash", {
      flowVersionId: "version-1",
      paramCurations: ["weatherApiKey"],
    });

    expect(result.ok).toBe(true);
    expect(artifactRepository.updateMetadata).toHaveBeenCalledWith(
      "artifact-hash",
      { flowVersionId: "version-1", paramCurations: ["weatherApiKey"] },
    );
  });

  it("never calls the repository when the flow version can't be found", async () => {
    const { service, artifactRepository, flowRepository } =
      makeArtifactService();
    (
      flowRepository.getFlowVersion as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ok: false,
      error: "not found",
    });

    const result = await service.updateArtifactMetadata("artifact-hash", {
      flowVersionId: "version-1",
      paramCurations: ["weatherApiKey"],
    });

    expect(result.ok).toBe(false);
    expect(artifactRepository.updateMetadata).not.toHaveBeenCalled();
  });
});
