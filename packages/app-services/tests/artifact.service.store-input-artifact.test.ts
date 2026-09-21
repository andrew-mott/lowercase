import { describe, expect, it, vi } from "vitest";
import type {
  ArtifactReadWritePort,
  ArtifactRepositoryPort,
  FlowRepositoryPort,
} from "@lcase/ports";
import type { ArtifactIndex } from "@lcase/types";
import { ArtifactService } from "../src/artifact.service.js";

const stored: ArtifactIndex = {
  hash: "a".repeat(64),
  time: "2026-09-20T00:00:00.000Z",
  contentType: "audio/webm",
  format: "bytes",
  curated: false,
};

function makeService(options?: {
  save?: ReturnType<typeof vi.fn>;
  getArtifact?: ReturnType<typeof vi.fn>;
}) {
  const save =
    options?.save ??
    vi.fn().mockResolvedValue({ status: "stored", hash: stored.hash });
  const getArtifact = options?.getArtifact ?? vi.fn().mockResolvedValue(stored);
  const service = new ArtifactService(
    { save } as unknown as ArtifactReadWritePort,
    { getArtifact } as unknown as ArtifactRepositoryPort,
    {} as FlowRepositoryPort,
  );
  return { service, save };
}

describe("ArtifactService.storeInputArtifact", () => {
  it("stores bytes under their content type without curating them", async () => {
    const { service, save } = makeService();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await service.storeInputArtifact({
      format: "bytes",
      value: bytes,
      index: { contentType: "audio/webm", filename: "clip.webm" },
    });

    expect(result).toEqual({ ok: true, value: stored });
    expect(save).toHaveBeenCalledWith(bytes, "audio/webm", {
      filename: "clip.webm",
    });
    expect(save.mock.calls[0]?.[2]).not.toHaveProperty("curated");
  });

  it("stores json as application/json", async () => {
    const { service, save } = makeService();

    await service.storeInputArtifact({
      format: "json",
      value: { language: "en" },
      index: { contentType: "text/json" },
    });

    expect(save).toHaveBeenCalledWith(
      { language: "en" },
      "application/json",
      expect.not.objectContaining({ curated: true }),
    );
  });

  it("passes a failed write through as an error", async () => {
    const save = vi.fn().mockResolvedValue({
      status: "failed",
      error: { code: "STORE_PUT_FAILED", message: "disk full" },
    });
    const { service } = makeService({ save });

    const result = await service.storeInputArtifact({
      format: "bytes",
      value: new Uint8Array([1]),
    });

    expect(result).toEqual({ ok: false, error: "disk full" });
  });

  it("reports an artifact whose metadata is missing after the write", async () => {
    const { service } = makeService({
      getArtifact: vi.fn().mockResolvedValue(undefined),
    });

    const result = await service.storeInputArtifact({
      format: "bytes",
      value: new Uint8Array([1]),
    });

    expect(result).toEqual({
      ok: false,
      error: `Artifact not found after save: ${stored.hash}`,
    });
  });
});
