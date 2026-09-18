import { describe, expect, it, afterEach } from "vitest";
import { FsArtifactStore } from "../../src/artifact-store/fs-artifact-store.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, rm } from "node:fs/promises";

const filePath = path.dirname(fileURLToPath(import.meta.url));
const testPath = path.join(filePath, "test-artifacts-v2-get");

const testHash =
  "2fde28ecc973a1fe910c4000b9afade87085cedb17f3da379148ffc75a9339b8";

describe("FsArtifactStore getBytes()", () => {
  afterEach(async () => {
    await rm(testPath, { recursive: true, force: true });
  });

  it("round-trips bytes and contentType through put then get", async () => {
    const store = new FsArtifactStore(testPath);
    const bytes = new TextEncoder().encode("# hello");
    await store.putBytes(testHash, bytes, "text/markdown");

    const result = await store.getBytes(testHash);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(new TextDecoder().decode(result.value.bytes)).toBe("# hello");
    expect(result.value.contentType).toBe("text/markdown");
  });

  it("returns NOT_FOUND for a hash that doesn't exist", async () => {
    const store = new FsArtifactStore(testPath);
    const result = await store.getBytes("1234567890");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns STORE_ERROR when content exists but the sidecar meta file is missing", async () => {
    const store = new FsArtifactStore(testPath);
    // write only the content file directly, bypassing putBytes so no sidecar exists
    const dir = path.join(testPath, testHash.slice(0, 2), testHash.slice(2, 4));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, testHash.slice(4)), Buffer.from("orphaned"));

    const result = await store.getBytes(testHash);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");
    expect(result.error.code).toBe("STORE_ERROR");
  });

  it("returns STORE_ERROR when the sidecar meta file exists but contains invalid JSON", async () => {
    const store = new FsArtifactStore(testPath);
    const dir = path.join(testPath, testHash.slice(0, 2), testHash.slice(2, 4));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, testHash.slice(4)), Buffer.from("orphaned"));
    await writeFile(
      path.join(dir, testHash.slice(4) + ".meta.json"),
      "{not valid json",
    );

    const result = await store.getBytes(testHash);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");
    expect(result.error.code).toBe("STORE_ERROR");
  });
});
