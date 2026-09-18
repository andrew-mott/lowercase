import { describe, expect, it, afterEach } from "vitest";
import { FsArtifactStore } from "../../src/artifact-store/fs-artifact-store.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, stat } from "node:fs/promises";

const filePath = path.dirname(fileURLToPath(import.meta.url));
const testPath = path.join(filePath, "test-artifacts-v2");

const testHash =
  "2fde28ecc973a1fe910c4000b9afade87085cedb17f3da379148ffc75a9339b8";

describe("FsArtifactStore putBytes()", () => {
  afterEach(async () => {
    await rm(testPath, { recursive: true, force: true });
  });

  it("creates a content file with no extension, hash-sharded", async () => {
    const store = new FsArtifactStore(testPath);
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    const result = await store.putBytes(testHash, bytes, "application/json");

    const expectedPath = path.join(
      testPath,
      "2f",
      "de",
      "28ecc973a1fe910c4000b9afade87085cedb17f3da379148ffc75a9339b8",
    );
    expect(result).toEqual({ ok: true, path: expectedPath });
  });

  it("does not rewrite content for a hash that already exists", async () => {
    const store = new FsArtifactStore(testPath);
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    const result = await store.putBytes(testHash, bytes, "application/json");
    if (!result.ok) throw new Error("expected ok result");

    const stat1 = await stat(result.path);
    await new Promise((resolve) => setTimeout(resolve, 1));

    const result2 = await store.putBytes(testHash, bytes, "text/plain");
    if (!result2.ok) throw new Error("expected ok result");
    expect(result2.path).toBe(result.path);

    const stat2 = await stat(result2.path);
    expect(stat2.mtimeMs).toBe(stat1.mtimeMs);
  });
});
