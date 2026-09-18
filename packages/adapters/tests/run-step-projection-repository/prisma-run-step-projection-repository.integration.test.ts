import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  forEachSqlProvider,
  type TestDb,
  type TestSqlClient,
} from "@lcase/test-support";
import { PrismaRunRepository } from "../../src/run-repository/prisma-run-repository.js";
import { PrismaRunStepProjectionRepository } from "../../src/run-step-projection-repository/prisma-run-step-projection-repository.js";

forEachSqlProvider((createDb) => {
  describe("PrismaRunStepProjectionRepository", () => {
    let db: TestDb;
    let prisma: TestSqlClient;
    let runRepository: PrismaRunRepository;
    let repository: PrismaRunStepProjectionRepository;

    beforeAll(async () => {
      db = await createDb();
      prisma = db.client;
    });

    afterAll(async () => {
      await db.dispose();
    });

    beforeEach(async () => {
      await db.reset();

      runRepository = new PrismaRunRepository(prisma);
      repository = new PrismaRunStepProjectionRepository(prisma);

      await runRepository.createRun({
        id: "run-step-test",
        traceId: "trace-step",
        status: "requested",
        source: "lowercase://test",
        flowDefHash: "a".repeat(64),
      });
    });

    it("upserts and reads a step projection", async () => {
      const result = await repository.upsertStepProjection({
        runId: "run-step-test",
        stepId: "fetch",
        status: "started",
        startTime: "2026-07-02T10:00:00.000Z",
        outputHash: "b".repeat(64),
        exportHashes: { body: "c".repeat(64) },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toEqual({
        runId: "run-step-test",
        stepId: "fetch",
        status: "started",
        startTime: "2026-07-02T10:00:00.000Z",
        outputHash: "b".repeat(64),
        exports: [{ name: "body", artifactHash: "c".repeat(64) }],
      });

      await expect(
        repository.getStepProjection("run-step-test", "fetch"),
      ).resolves.toEqual({
        ok: true,
        value: {
          runId: "run-step-test",
          stepId: "fetch",
          status: "started",
          startTime: "2026-07-02T10:00:00.000Z",
          outputHash: "b".repeat(64),
          exports: [{ name: "body", artifactHash: "c".repeat(64) }],
        },
      });
    });

    it("updates an existing step projection row", async () => {
      await repository.upsertStepProjection({
        runId: "run-step-test",
        stepId: "fetch",
        status: "started",
        startTime: "2026-07-02T10:00:00.000Z",
      });

      const result = await repository.upsertStepProjection({
        runId: "run-step-test",
        stepId: "fetch",
        status: "success",
        endTime: "2026-07-02T10:00:03.000Z",
        duration: 3,
        wasReused: true,
        reusedTime: "2026-07-02T10:00:02.000Z",
        exportHashes: { body: "d".repeat(64) },
      });

      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          runId: "run-step-test",
          stepId: "fetch",
          status: "success",
          endTime: "2026-07-02T10:00:03.000Z",
          duration: 3,
          wasReused: true,
          reusedTime: "2026-07-02T10:00:02.000Z",
          exports: [{ name: "body", artifactHash: "d".repeat(64) }],
        }),
      });
    });

    it("lists step projections by run in step order", async () => {
      await repository.upsertStepProjection({
        runId: "run-step-test",
        stepId: "zeta",
        status: "success",
      });
      await repository.upsertStepProjection({
        runId: "run-step-test",
        stepId: "alpha",
        status: "failed",
      });

      const steps = await repository.listStepProjections("run-step-test");
      expect(steps.map((step) => step.stepId)).toEqual(["alpha", "zeta"]);
    });
  });
});
