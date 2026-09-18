import { describe, expect, it, vi } from "vitest";
import { ArtifactWriter } from "../src/artifact-writer.js";
import { createFakeArtifactStorePort } from "./helpers/fake-artifact-store.js";
import { createFakeArtifactRepositoryPort } from "./helpers/fake-artifact-repository.js";

describe("ArtifactWriter save()", () => {
  it("saves JSON content", async () => {
    const { store, data } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    const writer = new ArtifactWriter(store, repository);

    const result = await writer.save({ hello: "world" }, "application/json");

    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    const stored = data.get(result.hash);
    expect(stored?.contentType).toBe("application/json");
    expect(new TextDecoder().decode(stored?.bytes)).toBe(
      JSON.stringify({ hello: "world" }),
    );
  });

  it("saves text/plain and text/markdown content", async () => {
    const { store, data } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    const writer = new ArtifactWriter(store, repository);

    const plain = await writer.save("hello", "text/plain");
    const markdown = await writer.save("# hello", "text/markdown");

    expect(plain.status).toBe("saved");
    expect(markdown.status).toBe("saved");
    expect(data.size).toBe(2);
  });

  it("saves raw bytes for any contentType", async () => {
    const { store, data } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    const writer = new ArtifactWriter(store, repository);

    const bytes = new Uint8Array([1, 2, 3]);
    const result = await writer.save(bytes, "audio/wav");

    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    const stored = data.get(result.hash);
    expect(stored?.bytes).toEqual(bytes);
    expect(stored?.contentType).toBe("audio/wav");
  });

  it("infers and stores the legacy format field from contentType", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository, rows } = createFakeArtifactRepositoryPort();
    const writer = new ArtifactWriter(store, repository);

    const json = await writer.save({ a: 1 }, "application/json");
    const text = await writer.save("hello", "text/plain");
    const markdown = await writer.save("# hello", "text/markdown");
    const bytes = await writer.save(new Uint8Array([1]), "audio/wav");

    if (json.status !== "saved") throw new Error("expected saved");
    if (text.status !== "saved") throw new Error("expected saved");
    if (markdown.status !== "saved") throw new Error("expected saved");
    if (bytes.status !== "saved") throw new Error("expected saved");

    expect(rows.get(json.hash)?.format).toBe("json");
    expect(rows.get(text.hash)?.format).toBe("text");
    expect(rows.get(markdown.hash)?.format).toBe("markdown");
    expect(rows.get(bytes.hash)?.format).toBe("bytes");
  });

  it("returns the real encoding error, not a generic wrapper, for content that doesn't match its contentType", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    const writer = new ArtifactWriter(store, repository);

    // an object, not a string, declared as text/plain
    const result = await writer.save(
      { not: "a string" } as unknown as string,
      "text/plain",
    );

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error.code).toBe("ENCODING_FAILED");
      expect(result.error.message).toBe(
        'Content for contentType "text/plain" must be a string or Uint8Array',
      );
    }
  });

  it("returns a failed outcome when the store put fails", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    vi.spyOn(store, "putBytes").mockResolvedValue({
      ok: false,
      cause: "disk full",
    });
    const writeArtifactSpy = vi.spyOn(repository, "writeArtifact");
    const writer = new ArtifactWriter(store, repository);

    const result = await writer.save({ a: 1 }, "application/json");

    expect(result.status).toBe("failed");
    expect(writeArtifactSpy).not.toHaveBeenCalled();
    if (result.status === "failed") {
      expect(result.error.code).toBe("STORE_PUT_FAILED");
    }
  });

  it("returns a content-only outcome, preserving the hash, when the repository write fails", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    vi.spyOn(repository, "writeArtifact").mockResolvedValue({
      ok: false,
      error: "constraint violation",
    });
    const writer = new ArtifactWriter(store, repository);

    const result = await writer.save({ a: 1 }, "application/json");

    expect(result.status).toBe("content-only");
    if (result.status === "content-only") {
      expect(result.hash).toBeTruthy();
      expect(result.error.code).toBe("METADATA_WRITE_FAILED");
      expect(result.error.cause).toBe("constraint violation");
    }
  });

  it("passes label through to the repository as non-curated metadata", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository, rows } = createFakeArtifactRepositoryPort();
    const writer = new ArtifactWriter(store, repository);

    const result = await writer.save({ a: 1 }, "application/json", {
      label: "my label",
    });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    const row = rows.get(result.hash);
    expect(row?.curated).toBe(false);
    expect(row?.label).toBe("my label");
    expect(row?.format).toBe("json");
  });

  it("passes full curated metadata (paramCurations, flowVersionId) through to the repository", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository, rows } = createFakeArtifactRepositoryPort();
    const writer = new ArtifactWriter(store, repository);

    const result = await writer.save({ a: 1 }, "application/json", {
      curated: true,
      label: "curated label",
      flowVersionId: "flow-version-1",
      paramCurations: ["someParam"],
    });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    const row = rows.get(result.hash);
    expect(row?.curated).toBe(true);
    expect(row?.label).toBe("curated label");
    expect(row?.flowVersionId).toBe("flow-version-1");
  });
});
