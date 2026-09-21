import { describe, expect, it } from "vitest";
import { ArtifactReader } from "../src/artifact-reader.js";
import { createFakeArtifactStorePort } from "./helpers/fake-artifact-store.js";

describe("ArtifactReader load() with raw: true", () => {
  it("returns JSON as the exact stored bytes, not a parsed value", async () => {
    const { store, data } = createFakeArtifactStorePort();
    // Whitespace that parsing and re-serializing would not reproduce.
    const bytes = new TextEncoder().encode('{ "hello":   "world" }\n');
    data.set("hash-1", { bytes, contentType: "application/json" });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1", { raw: true });

    expect(result).toEqual({
      ok: true,
      contentType: "application/json",
      value: bytes,
    });
  });

  it("returns text as bytes with its stored content type", async () => {
    const { store, data } = createFakeArtifactStorePort();
    const bytes = new TextEncoder().encode("hello");
    data.set("hash-1", { bytes, contentType: "text/plain" });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1", { raw: true });

    expect(result).toEqual({
      ok: true,
      contentType: "text/plain",
      value: bytes,
    });
  });

  it("returns binary content unchanged", async () => {
    const { store, data } = createFakeArtifactStorePort();
    const bytes = new Uint8Array([0, 255, 1, 254]);
    data.set("hash-1", { bytes, contentType: "audio/wav" });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1", { raw: true });

    expect(result).toEqual({
      ok: true,
      contentType: "audio/wav",
      value: bytes,
    });
  });

  it("fails with NOT_FOUND when the hash isn't in the store", async () => {
    const { store } = createFakeArtifactStorePort();
    const reader = new ArtifactReader(store);

    const result = await reader.load("missing-hash", { raw: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
