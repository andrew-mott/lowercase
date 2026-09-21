import { describe, expect, it, vi } from "vitest";
import type {
  ArtifactReadWritePort,
  ArtifactRepositoryPort,
  FlowRepositoryPort,
} from "@lcase/ports";
import { ArtifactService } from "../src/artifact.service.js";

function makeService(load: ReturnType<typeof vi.fn>) {
  return new ArtifactService(
    { load } as unknown as ArtifactReadWritePort,
    {} as ArtifactRepositoryPort,
    {} as FlowRepositoryPort,
  );
}

describe("ArtifactService.getArtifactContent", () => {
  it("returns the stored bytes and content type from a raw load", async () => {
    const stored = {
      ok: true,
      contentType: "application/json",
      value: new TextEncoder().encode('{ "a":   1 }'),
    };
    const load = vi.fn().mockResolvedValue(stored);

    const result = await makeService(load).getArtifactContent("hash-1");

    expect(load).toHaveBeenCalledWith("hash-1", { raw: true });
    expect(result).toBe(stored);
  });

  it("passes a load failure through", async () => {
    const failure = {
      ok: false,
      error: { code: "NOT_FOUND", message: "missing" },
    };
    const load = vi.fn().mockResolvedValue(failure);

    const result = await makeService(load).getArtifactContent("hash-1");

    expect(result).toBe(failure);
  });
});
