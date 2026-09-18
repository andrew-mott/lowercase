import { describe, expect, it } from "vitest";
import { createArtifactReadWritePort } from "../src/artifact-read-write.js";
import { createFakeArtifactStorePort } from "./helpers/fake-artifact-store.js";
import { createFakeArtifactRepositoryPort } from "./helpers/fake-artifact-repository.js";

describe("createArtifactReadWritePort()", () => {
  it("saves and loads content through the same flat port", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    const artifacts = createArtifactReadWritePort(store, repository);

    const saved = await artifacts.save({ hello: "world" }, "application/json");
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") return;

    const loaded = await artifacts.load(saved.hash, "application/json");
    expect(loaded).toEqual({ ok: true, value: { hello: "world" } });
  });

  it("supports auto-mode load()", async () => {
    const { store } = createFakeArtifactStorePort();
    const { repository } = createFakeArtifactRepositoryPort();
    const artifacts = createArtifactReadWritePort(store, repository);

    const saved = await artifacts.save("hello", "text/plain");
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") return;

    const loaded = await artifacts.load(saved.hash);
    expect(loaded).toEqual({
      ok: true,
      contentType: "text/plain",
      value: "hello",
    });
  });
});
