import { describe, expect, it, afterEach } from "vitest";
import { FsArtifactStore } from "../../src/artifact-store/fs-artifact-store.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";

const filePath = path.dirname(fileURLToPath(import.meta.url));
const testPath = path.join(filePath, "test-artifacts-legacy-fallback-read");

const testHash =
  "3fde28ecc973a1fe910c4000b9afade87085cedb17f3da379148ffc75a9339b8";

// Mirrors LegacyFsArtifactStore's own (now-deleted) file layout directly --
// dirOne/dirTwo sharding by hash prefix, filename = hash.slice(4) + extension
// -- since real historical artifacts on disk were written in exactly this
// shape and FsArtifactStore must go on finding them regardless of whether
// the legacy writer class itself still exists.
async function writeLegacyFixture(
  hash: string,
  extension: string,
  content: string,
): Promise<void> {
  const dir = path.join(testPath, hash.slice(0, 2), hash.slice(2, 4));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, hash.slice(4) + extension), content);
}

// Regression test: run params and flow defs were, for a time, written
// exclusively through the legacy extensioned-file format. FsArtifactStore
// must still find those, or a worker read routed through it would fail to
// resolve a param reference that predates the new writer.
describe("FsArtifactStore reads content written in the legacy extensioned format", () => {
  afterEach(async () => {
    await rm(testPath, { recursive: true, force: true });
  });

  it("finds a legacy-extensioned file and derives contentType from its extension", async () => {
    await writeLegacyFixture(testHash, ".txt", "hello");
    const newStore = new FsArtifactStore(testPath);

    const result = await newStore.getBytes(testHash);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.value.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(result.value.bytes)).toBe("hello");
  });

  it("still prefers the new sidecar-backed format over a legacy file when both exist", async () => {
    await writeLegacyFixture(testHash, ".txt", "legacy content");
    const newStore = new FsArtifactStore(testPath);
    await newStore.putBytes(
      testHash,
      new TextEncoder().encode("new content"),
      "text/plain",
    );

    const result = await newStore.getBytes(testHash);

    if (!result.ok) throw new Error("expected ok result");
    expect(new TextDecoder().decode(result.value.bytes)).toBe("new content");
  });
});
