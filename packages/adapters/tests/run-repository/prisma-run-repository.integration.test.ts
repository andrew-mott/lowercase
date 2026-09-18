import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  forEachSqlProvider,
  type TestDb,
  type TestSqlClient,
} from "@lcase/test-support";
import { PrismaRunRepository } from "../../src/run-repository/prisma-run-repository.js";

forEachSqlProvider((createDb) => {
  describe("PrismaRunRepository", () => {
    let db: TestDb;
    let prisma: TestSqlClient;
    let repository: PrismaRunRepository;

    beforeAll(async () => {
      db = await createDb();
      prisma = db.client;
    });

    afterAll(async () => {
      await db.dispose();
    });

    beforeEach(async () => {
      await db.reset();

      const createdAt = new Date("2026-07-02T10:00:00.000Z");
      await prisma.flow.create({
        data: {
          id: "flow-1",
          name: "Prompt Flow",
          createdAt,
          updatedAt: createdAt,
          versions: {
            create: {
              id: "flow-version-1",
              sequence: 1,
              definitionHash: "a".repeat(64),
              versionLabel: "v1",
              createdAt,
            },
          },
        },
      });
      await prisma.sim.create({
        data: {
          id: "sim-1",
          name: "Saved Sim",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          forkSpecHash: "b".repeat(64),
          createdAt,
          updatedAt: createdAt,
        },
      });

      repository = new PrismaRunRepository(prisma);
    });

    it("creates and reads a run record", async () => {
      const result = await repository.createRun({
        id: "run-test-1",
        traceId: "trace-1",
        status: "requested",
        source: "lowercase://test",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "a".repeat(64),
        simId: "sim-1",
        forkSpecHash: "b".repeat(64),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toEqual(
        expect.objectContaining({
          id: "run-test-1",
          traceId: "trace-1",
          status: "requested",
          source: "lowercase://test",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          flowDefHash: "a".repeat(64),
          simId: "sim-1",
          forkSpecHash: "b".repeat(64),
        }),
      );

      await expect(repository.getRun("run-test-1")).resolves.toEqual({
        ok: true,
        value: expect.objectContaining({
          id: "run-test-1",
          status: "requested",
        }),
      });
    });

    it("updates lifecycle fields for an existing run", async () => {
      await repository.createRun({
        id: "run-test-2",
        traceId: "trace-2",
        status: "requested",
        source: "lowercase://test",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "a".repeat(64),
      });

      const result = await repository.updateRun({
        id: "run-test-2",
        status: "completed",
        startTime: "2026-07-02T10:00:00.000Z",
        endTime: "2026-07-02T10:00:05.000Z",
        duration: 5,
      });

      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id: "run-test-2",
          status: "completed",
          startTime: "2026-07-02T10:00:00.000Z",
          endTime: "2026-07-02T10:00:05.000Z",
          duration: 5,
        }),
      });
    });

    it("lists runs newest first", async () => {
      await repository.createRun({
        id: "run-first",
        traceId: "trace-first",
        status: "requested",
        source: "lowercase://test",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "a".repeat(64),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));

      await repository.createRun({
        id: "run-second",
        traceId: "trace-second",
        status: "requested",
        source: "lowercase://test",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "a".repeat(64),
      });

      const runs = await repository.listRuns();
      expect(runs.map((run) => run.id)).toEqual(["run-second", "run-first"]);
    });

    it("upserts when createRun is called again for the same run id", async () => {
      await repository.createRun({
        id: "run-test-3",
        traceId: "trace-3",
        status: "requested",
        source: "lowercase://test",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "a".repeat(64),
      });

      const result = await repository.createRun({
        id: "run-test-3",
        traceId: "trace-3",
        status: "started",
        source: "lowercase://updated",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "a".repeat(64),
        startTime: "2026-07-02T10:00:00.000Z",
      });

      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id: "run-test-3",
          status: "started",
          source: "lowercase://updated",
          startTime: "2026-07-02T10:00:00.000Z",
        }),
      });
    });

    // Params are written through a nested write on the run, and RunRecord does
    // not carry them, so these read the rows back directly. The three-way
    // distinction is the point: absent leaves them alone, present replaces them
    // wholesale, and an empty object clears them.
    describe("run params", () => {
      async function paramsFor(runId: string) {
        const rows = await prisma.runParam.findMany({
          where: { runId },
          orderBy: [{ name: "asc" }],
        });
        return rows.map((row) => ({
          name: row.name,
          artifactHash: row.artifactHash,
        }));
      }

      const base = {
        id: "run-params",
        traceId: "trace-params",
        status: "requested" as const,
        source: "lowercase://test",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        flowDefHash: "a".repeat(64),
      };

      it("writes params supplied on create", async () => {
        const result = await repository.createRun({
          ...base,
          params: { prompt: "c".repeat(64), seed: "d".repeat(64) },
        });

        expect(result.ok).toBe(true);
        await expect(paramsFor("run-params")).resolves.toEqual([
          { name: "prompt", artifactHash: "c".repeat(64) },
          { name: "seed", artifactHash: "d".repeat(64) },
        ]);
      });

      it("replaces params wholesale when the run is upserted again", async () => {
        await repository.createRun({
          ...base,
          params: { prompt: "c".repeat(64), seed: "d".repeat(64) },
        });

        await repository.createRun({
          ...base,
          status: "started",
          params: { prompt: "e".repeat(64) },
        });

        // "seed" is gone rather than merged, and "prompt" points at the new hash.
        await expect(paramsFor("run-params")).resolves.toEqual([
          { name: "prompt", artifactHash: "e".repeat(64) },
        ]);
      });

      it("clears params when given an empty object", async () => {
        await repository.createRun({
          ...base,
          params: { prompt: "c".repeat(64) },
        });

        await repository.createRun({ ...base, status: "started", params: {} });

        await expect(paramsFor("run-params")).resolves.toEqual([]);
      });

      // The nested deleteMany carries no runId -- it relies on the parent to
      // scope it. If that scoping were wrong it would clear every run's params,
      // which is the one failure here that would be silent and catastrophic.
      it("replacing one run's params leaves another run's alone", async () => {
        await repository.createRun({
          ...base,
          params: { prompt: "c".repeat(64) },
        });
        await repository.createRun({
          ...base,
          id: "run-params-other",
          params: { prompt: "f".repeat(64), extra: "0".repeat(64) },
        });

        await repository.createRun({
          ...base,
          status: "started",
          params: { prompt: "e".repeat(64) },
        });

        await expect(paramsFor("run-params-other")).resolves.toEqual([
          { name: "extra", artifactHash: "0".repeat(64) },
          { name: "prompt", artifactHash: "f".repeat(64) },
        ]);
      });

      it("leaves existing params untouched when params is omitted", async () => {
        await repository.createRun({
          ...base,
          params: { prompt: "c".repeat(64) },
        });

        await repository.createRun({ ...base, status: "started" });

        await expect(paramsFor("run-params")).resolves.toEqual([
          { name: "prompt", artifactHash: "c".repeat(64) },
        ]);
      });
    });
  });
});
