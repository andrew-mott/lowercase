import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  forEachSqlProvider,
  type TestDb,
  type TestSqlClient,
} from "@lcase/test-support";
import { PrismaArtifactRepository } from "../../src/artifact-repository/prisma-artifact-repository.js";

forEachSqlProvider((createDb) => {
  describe("PrismaArtifactRepository", () => {
    let db: TestDb;
    let prisma: TestSqlClient;
    let repository: PrismaArtifactRepository;

    beforeAll(async () => {
      db = await createDb();
      prisma = db.client;
    });

    afterAll(async () => {
      await db.dispose();
    });

    beforeEach(async () => {
      await db.reset();

      repository = new PrismaArtifactRepository(prisma);
    });

    it("saves and reads artifact metadata by hash", async () => {
      const result = await repository.writeArtifact(
        {
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          filename: "prompt.md",
          contentType: "text/markdown",
          size: 42,
          format: "markdown",
        },
        { curated: false, label: "Prompt" },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const artifact = await repository.getArtifact("a".repeat(64));
      expect(artifact).toEqual(result.value);
    });

    it("writeArtifact called again on the same hash with no metadata does not clear an existing flowId/flowVersionId association", async () => {
      // simulates the exact real-world case: a run later produces byte-
      // identical content to something already curated -- the worker's
      // writeArtifact call omits metadata entirely, so this must be a true
      // no-op on those columns
      const flow = await prisma.flow.create({ data: { name: "Test Flow" } });
      const flowVersion = await prisma.flowVersion.create({
        data: { flowId: flow.id, sequence: 1, definitionHash: "h".repeat(64) },
      });

      await repository.writeArtifact({
        hash: "a".repeat(64),
        time: "2026-06-30T00:00:00.000Z",
        format: "json",
      });
      await repository.updateMetadata("a".repeat(64), {
        flowId: flow.id,
        flowVersionId: flowVersion.id,
      });

      const result = await repository.writeArtifact({
        hash: "a".repeat(64),
        time: "2026-07-01T00:00:00.000Z",
        format: "json",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.flowId).toBe(flow.id);
      expect(result.value.flowVersionId).toBe(flowVersion.id);
    });

    it("lists artifact metadata newest first", async () => {
      await repository.writeArtifact({
        hash: "a".repeat(64),
        time: "2025-01-01T00:00:00.000Z",
        format: "json",
      });
      await repository.writeArtifact({
        hash: "b".repeat(64),
        time: "2026-01-01T00:00:00.000Z",
        format: "text",
      });

      const artifacts = await repository.listArtifacts();
      expect(artifacts.map((item) => item.artifact.hash)).toEqual([
        "b".repeat(64),
        "a".repeat(64),
      ]);
    });

    describe("listArtifacts filter", () => {
      it("with no filter, returns everything (unchanged behavior)", async () => {
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.writeArtifact({
          hash: "b".repeat(64),
          time: "2026-01-01T00:00:00.000Z",
          format: "json",
        });

        const artifacts = await repository.listArtifacts();
        expect(artifacts).toHaveLength(2);
      });

      it("filters by curated", async () => {
        const { flow, flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.writeArtifact({
          hash: "b".repeat(64),
          time: "2026-01-01T00:00:00.000Z",
          format: "json",
        });
        // updateMetadata always sets curated: true as a side effect -- "b"
        // stays uncurated simply by never having updateMetadata called on it
        await repository.updateMetadata("a".repeat(64), {
          flowId: flow.id,
          flowVersionId: flowVersion.id,
        });

        const curated = await repository.listArtifacts({ curated: true });
        expect(curated.map((item) => item.artifact.hash)).toEqual([
          "a".repeat(64),
        ]);

        const uncurated = await repository.listArtifacts({ curated: false });
        expect(uncurated.map((item) => item.artifact.hash)).toEqual([
          "b".repeat(64),
        ]);
      });

      it("filters by flowId and flowVersionId, and combines with curated", async () => {
        const { flow, flowVersion } = await createFlowAndVersion();
        const otherFlow = await prisma.flow.create({
          data: { name: "Other Flow" },
        });
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.writeArtifact({
          hash: "b".repeat(64),
          time: "2026-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.updateMetadata("a".repeat(64), {
          flowId: flow.id,
          flowVersionId: flowVersion.id,
        });
        await repository.updateMetadata("b".repeat(64), {
          flowId: otherFlow.id,
        });

        const byFlow = await repository.listArtifacts({ flowId: flow.id });
        expect(byFlow.map((item) => item.artifact.hash)).toEqual([
          "a".repeat(64),
        ]);

        const byVersion = await repository.listArtifacts({
          flowVersionId: flowVersion.id,
        });
        expect(byVersion.map((item) => item.artifact.hash)).toEqual([
          "a".repeat(64),
        ]);

        const combined = await repository.listArtifacts({
          flowId: flow.id,
          curated: true,
        });
        expect(combined.map((item) => item.artifact.hash)).toEqual([
          "a".repeat(64),
        ]);
      });

      it("includes paramCurations when scoped by flowVersionId, empty for uncurated artifacts", async () => {
        const { flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.writeArtifact({
          hash: "b".repeat(64),
          time: "2026-01-01T00:00:00.000Z",
          format: "json",
        });
        // listArtifacts filters on the Artifact row's own flowVersionId column,
        // which is independent of the join-table's per-curation flowVersionId --
        // both must be set for an artifact to show up in a version-scoped list.
        // paramCurations is full-replace, so both params go in one call.
        await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey", "otherParam"],
        });
        await repository.updateMetadata("b".repeat(64), {
          flowVersionId: flowVersion.id,
        });

        const items = await repository.listArtifacts({
          flowVersionId: flowVersion.id,
        });
        const curatedItem = items.find(
          (item) => item.artifact.hash === "a".repeat(64),
        );
        const uncuratedItem = items.find(
          (item) => item.artifact.hash === "b".repeat(64),
        );

        expect(curatedItem?.associations.paramCurations).toEqual(
          expect.arrayContaining([
            { flowVersionId: flowVersion.id, paramName: "weatherApiKey" },
            { flowVersionId: flowVersion.id, paramName: "otherParam" },
          ]),
        );
        expect(curatedItem?.associations.paramCurations).toHaveLength(2);
        expect(uncuratedItem?.associations.paramCurations).toEqual([]);
      });

      it("leaves paramCurations empty for every item when no flowVersionId filter is given, even if curations exist", async () => {
        const { flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });

        const items = await repository.listArtifacts();
        expect(
          items.every((item) => item.associations.paramCurations.length === 0),
        ).toBe(true);
      });

      it("filters by hash, finding an artifact with no flowId/flowVersionId/curated association at all -- the exact shape a worker-produced run output/export has", async () => {
        // writeArtifact with no metadata is exactly what the worker does when
        // storing a step's output/export -- flowId/flowVersionId/curated all
        // stay unset, so a flowVersionId-scoped filter alone could never find
        // this row, curated or not.
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.writeArtifact({
          hash: "b".repeat(64),
          time: "2026-01-01T00:00:00.000Z",
          format: "json",
        });

        const byHash = await repository.listArtifacts({ hash: "a".repeat(64) });
        expect(byHash.map((item) => item.artifact.hash)).toEqual([
          "a".repeat(64),
        ]);
      });

      it("hash takes over row-selection entirely, ignoring flowId/curated even when they're also present in the filter", async () => {
        const { flow } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });

        const items = await repository.listArtifacts({
          hash: "a".repeat(64),
          flowId: flow.id, // this artifact has no association with `flow` at all
          curated: true, // and it's not curated either
        });
        expect(items.map((item) => item.artifact.hash)).toEqual([
          "a".repeat(64),
        ]);
      });

      it("hash filter still scopes paramCurations by flowVersionId when both are given", async () => {
        const { flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2025-01-01T00:00:00.000Z",
          format: "json",
        });
        await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });

        const withVersion = await repository.listArtifacts({
          hash: "a".repeat(64),
          flowVersionId: flowVersion.id,
        });
        expect(withVersion[0]?.associations.paramCurations).toEqual([
          { flowVersionId: flowVersion.id, paramName: "weatherApiKey" },
        ]);

        const withoutVersion = await repository.listArtifacts({
          hash: "a".repeat(64),
        });
        expect(withoutVersion[0]?.associations.paramCurations).toEqual([]);
      });

      it("hash for an artifact that doesn't exist returns an empty list, not an error", async () => {
        const items = await repository.listArtifacts({ hash: "c".repeat(64) });
        expect(items).toEqual([]);
      });
    });

    it("lists artifact hashes newest first", async () => {
      await repository.writeArtifact({
        hash: "a".repeat(64),
        time: "2025-01-01T00:00:00.000Z",
        format: "json",
      });
      await repository.writeArtifact({
        hash: "c".repeat(64),
        time: "2027-01-01T00:00:00.000Z",
        format: "bytes",
      });

      const hashes = await repository.listArtifactHashes();
      expect(hashes).toEqual(["c".repeat(64), "a".repeat(64)]);
    });

    async function createFlowAndVersion() {
      const flow = await prisma.flow.create({
        data: { name: "Test Flow" },
      });
      const flowVersion = await prisma.flowVersion.create({
        data: { flowId: flow.id, sequence: 1, definitionHash: "h".repeat(64) },
      });
      return { flow, flowVersion };
    }

    describe("writeArtifact with real metadata (the new insert-with-metadata capability)", () => {
      it("curated: false with a label sets the label but leaves curated false", async () => {
        const result = await repository.writeArtifact(
          {
            hash: "a".repeat(64),
            time: "2026-06-30T00:00:00.000Z",
            format: "json",
          },
          { curated: false, label: "system label" },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.label).toBe("system label");
        expect(result.value.curated).toBe(false);
      });

      it("curated: true with no paramCurations sets curated on insert directly", async () => {
        const { flow, flowVersion } = await createFlowAndVersion();
        const result = await repository.writeArtifact(
          {
            hash: "a".repeat(64),
            time: "2026-06-30T00:00:00.000Z",
            format: "json",
          },
          { curated: true, flowId: flow.id, flowVersionId: flowVersion.id },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.curated).toBe(true);
        expect(result.value.flowId).toBe(flow.id);
        expect(result.value.flowVersionId).toBe(flowVersion.id);
      });

      it("curated: true with paramCurations inserts the artifact and curates it for a param in one call", async () => {
        const { flowVersion } = await createFlowAndVersion();
        const result = await repository.writeArtifact(
          {
            hash: "a".repeat(64),
            time: "2026-06-30T00:00:00.000Z",
            format: "json",
          },
          {
            curated: true,
            flowVersionId: flowVersion.id,
            paramCurations: ["weatherApiKey"],
          },
        );
        expect(result.ok).toBe(true);

        const curated = await repository.listCuratedArtifacts(
          flowVersion.id,
          "weatherApiKey",
        );
        expect(curated.map((artifact) => artifact.hash)).toEqual([
          "a".repeat(64),
        ]);
      });
    });

    describe("updateMetadata", () => {
      it("an empty object leaves label/flowId/flowVersionId unchanged, but still marks the artifact curated", async () => {
        await repository.writeArtifact(
          {
            hash: "a".repeat(64),
            time: "2026-06-30T00:00:00.000Z",
            format: "json",
          },
          { curated: false, label: "original" },
        );

        const result = await repository.updateMetadata("a".repeat(64), {});

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.label).toBe("original");
        expect(result.value.flowId).toBeUndefined();
        expect(result.value.flowVersionId).toBeUndefined();
        expect(result.value.curated).toBe(true);
      });

      it("sets flowId and flowVersionId on an existing artifact", async () => {
        const { flow, flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });

        const result = await repository.updateMetadata("a".repeat(64), {
          flowId: flow.id,
          flowVersionId: flowVersion.id,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.flowId).toBe(flow.id);
        expect(result.value.flowVersionId).toBe(flowVersion.id);
      });

      it("leaves omitted fields unchanged, and clears a field set to null", async () => {
        const { flow, flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });
        await repository.updateMetadata("a".repeat(64), {
          flowId: flow.id,
          flowVersionId: flowVersion.id,
        });

        const result = await repository.updateMetadata("a".repeat(64), {
          flowVersionId: null,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.flowId).toBe(flow.id);
        expect(result.value.flowVersionId).toBeUndefined();
      });

      it("fails for a hash that doesn't exist", async () => {
        const result = await repository.updateMetadata("z".repeat(64), {
          flowId: "nonexistent",
        });
        expect(result.ok).toBe(false);
      });

      it("new artifacts default to curated: false", async () => {
        const saveResult = await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });
        expect(saveResult.ok).toBe(true);
        if (!saveResult.ok) return;
        expect(saveResult.value.curated).toBe(false);
      });

      it("always sets curated to true, regardless of what's passed, and it can never be set back to false", async () => {
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });

        const result = await repository.updateMetadata("a".repeat(64), {
          label: "just a label change",
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.curated).toBe(true);

        // ArtifactUpdateMetadata has no `curated` field at all -- there is no way to
        // pass anything that would set it back to false through this method
      });

      it("writeArtifact called again on the same hash with no metadata does not clear an existing curated flag", async () => {
        // mirrors the flowId/flowVersionId case above -- the worker's
        // writeArtifact call omits metadata entirely, so a run later
        // producing byte-identical content must not be able to un-curate it
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });
        await repository.updateMetadata("a".repeat(64), {});

        const result = await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-07-01T00:00:00.000Z",
          format: "json",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.curated).toBe(true);
      });

      it("curates an artifact for a param, then lists it", async () => {
        const { flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });

        const result = await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });
        expect(result.ok).toBe(true);

        const curated = await repository.listCuratedArtifacts(
          flowVersion.id,
          "weatherApiKey",
        );
        expect(curated.map((artifact) => artifact.hash)).toEqual([
          "a".repeat(64),
        ]);
      });

      it("re-sending the same paramCurations is idempotent", async () => {
        const { flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });

        await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });
        const secondResult = await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });

        expect(secondResult.ok).toBe(true);
        const curated = await repository.listCuratedArtifacts(
          flowVersion.id,
          "weatherApiKey",
        );
        expect(curated).toHaveLength(1);
      });

      it("an empty paramCurations array removes all curations for that flow version", async () => {
        const { flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });
        await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });

        const result = await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: [],
        });
        expect(result.ok).toBe(true);

        const curated = await repository.listCuratedArtifacts(
          flowVersion.id,
          "weatherApiKey",
        );
        expect(curated).toEqual([]);
      });

      it("scopes curated artifacts by paramName within the same flow version", async () => {
        const { flowVersion } = await createFlowAndVersion();
        await repository.writeArtifact({
          hash: "a".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });
        await repository.writeArtifact({
          hash: "b".repeat(64),
          time: "2026-06-30T00:00:00.000Z",
          format: "json",
        });
        await repository.updateMetadata("a".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });
        await repository.updateMetadata("b".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["otherParam"],
        });

        const curated = await repository.listCuratedArtifacts(
          flowVersion.id,
          "weatherApiKey",
        );
        expect(curated.map((artifact) => artifact.hash)).toEqual([
          "a".repeat(64),
        ]);
      });

      it("fails to curate a hash that was never saved as an artifact (FK constraint)", async () => {
        const { flowVersion } = await createFlowAndVersion();

        const result = await repository.updateMetadata("z".repeat(64), {
          flowVersionId: flowVersion.id,
          paramCurations: ["weatherApiKey"],
        });

        expect(result.ok).toBe(false);
      });
    });
  });
});
