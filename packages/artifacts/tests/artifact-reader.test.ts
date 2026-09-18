import { describe, expect, it } from "vitest";
import { ArtifactReader } from "../src/artifact-reader.js";
import { createFakeArtifactStorePort } from "./helpers/fake-artifact-store.js";

describe("ArtifactReader load()", () => {
  it("auto-mode: infers and decodes JSON content", async () => {
    const { store, data } = createFakeArtifactStorePort();
    data.set("hash-1", {
      bytes: new TextEncoder().encode(JSON.stringify({ hello: "world" })),
      contentType: "application/json",
    });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contentType).toBe("application/json");
    expect(result.value).toEqual({ hello: "world" });
  });

  it("auto-mode: infers and decodes text content", async () => {
    const { store, data } = createFakeArtifactStorePort();
    data.set("hash-1", {
      bytes: new TextEncoder().encode("hello"),
      contentType: "text/plain",
    });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contentType).toBe("text/plain");
    expect(result.value).toBe("hello");
  });

  it("auto-mode: passes through raw bytes for an unrecognized contentType", async () => {
    const { store, data } = createFakeArtifactStorePort();
    const bytes = new Uint8Array([1, 2, 3]);
    data.set("hash-1", { bytes, contentType: "audio/wav" });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contentType).toBe("audio/wav");
    expect(result.value).toEqual(bytes);
  });

  it("confirming-mode: decodes when the requested contentType matches what's stored", async () => {
    const { store, data } = createFakeArtifactStorePort();
    data.set("hash-1", {
      bytes: new TextEncoder().encode(JSON.stringify({ a: 1 })),
      contentType: "application/json",
    });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1", "application/json");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ a: 1 });
  });

  it("confirming-mode: fails with TYPE_MISMATCH when the requested contentType doesn't match what's stored", async () => {
    const { store, data } = createFakeArtifactStorePort();
    data.set("hash-1", {
      bytes: new TextEncoder().encode("hello"),
      contentType: "text/markdown",
    });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1", "text/plain");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("TYPE_MISMATCH");
    expect(result.error.message).toBe(
      'Expected contentType "text/plain" but stored artifact has "text/markdown"',
    );
  });

  it("fails with NOT_FOUND when the hash isn't in the store", async () => {
    const { store } = createFakeArtifactStorePort();
    const reader = new ArtifactReader(store);

    const result = await reader.load("missing-hash");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns the real decoding error, not a generic wrapper, for content that doesn't match its declared contentType", async () => {
    const { store, data } = createFakeArtifactStorePort();
    data.set("hash-1", {
      bytes: new TextEncoder().encode("not json"),
      contentType: "application/json",
    });
    const reader = new ArtifactReader(store);

    const result = await reader.load("hash-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DECODING_FAILED");
    expect(result.error.message).toBeTruthy();
  });
});
