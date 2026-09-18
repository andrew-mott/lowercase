import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  forEachSqlProvider,
  type TestDb,
  type TestSqlClient,
} from "@lcase/test-support";
import { PrismaEvalResultRepository } from "../../src/eval-result-repository/prisma-eval-result-repository.js";

forEachSqlProvider((createDb) => {
  describe("PrismaEvalResultRepository", () => {
    let db: TestDb;
    let prisma: TestSqlClient;
    let repository: PrismaEvalResultRepository;

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
          name: "Weather Flow",
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
      await prisma.flow.create({
        data: {
          id: "flow-eval",
          name: "Rubric Judge",
          kind: "eval",
          createdAt,
          updatedAt: createdAt,
          versions: {
            create: {
              id: "flow-eval-version-1",
              sequence: 1,
              definitionHash: "b".repeat(64),
              versionLabel: "v1",
              createdAt,
            },
          },
        },
      });
      await prisma.run.create({
        data: {
          id: "run-subject",
          traceId: "trace-subject",
          status: "completed",
          source: "lowercase://test",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          flowDefHash: "a".repeat(64),
          createdAt,
          updatedAt: createdAt,
        },
      });
      await prisma.run.create({
        data: {
          id: "run-eval",
          traceId: "trace-eval",
          status: "completed",
          source: "lowercase://test",
          flowId: "flow-eval",
          flowVersionId: "flow-eval-version-1",
          flowDefHash: "b".repeat(64),
          experimentId: "exp-1",
          targetRunId: "run-subject",
          targetStepId: "reportForecast",
          targetExportName: "answer",
          createdAt,
          updatedAt: createdAt,
        },
      });

      repository = new PrismaEvalResultRepository(prisma);
    });

    it("creates and reads back an eval result with its JSON payload round-tripped", async () => {
      const result = await repository.createEvalResult({
        targetRunId: "run-subject",
        targetStepId: "reportForecast",
        targetExportName: "answer",
        evalRunId: "run-eval",
        evalFlowId: "flow-eval",
        evalFlowVersionId: "flow-eval-version-1",
        experimentId: "exp-1",
        overall: 0.86,
        passed: true,
        payload: {
          overall: 0.86,
          passed: true,
          dimensions: {
            correctness: {
              score: 0.9,
              rationale: "Matches the forecast data.",
            },
            faithfulness: { score: 0.82 },
          },
          rationale: "Grounded in the provided weather JSON.",
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toEqual(
        expect.objectContaining({
          targetRunId: "run-subject",
          targetStepId: "reportForecast",
          targetExportName: "answer",
          evalRunId: "run-eval",
          experimentId: "exp-1",
          overall: 0.86,
          passed: true,
          payload: {
            overall: 0.86,
            passed: true,
            dimensions: {
              correctness: {
                score: 0.9,
                rationale: "Matches the forecast data.",
              },
              faithfulness: { score: 0.82 },
            },
            rationale: "Grounded in the provided weather JSON.",
          },
        }),
      );
    });

    it("lists eval results by experiment id and by target run id", async () => {
      await repository.createEvalResult({
        targetRunId: "run-subject",
        evalRunId: "run-eval",
        experimentId: "exp-1",
        overall: 0.7,
        passed: false,
        payload: { overall: 0.7, passed: false, dimensions: {} },
      });

      const byExperiment = await repository.listByExperimentId("exp-1");
      expect(byExperiment).toHaveLength(1);
      expect(byExperiment[0]?.evalRunId).toBe("run-eval");

      const byTargetRun = await repository.listByTargetRunId("run-subject");
      expect(byTargetRun).toHaveLength(1);
      expect(byTargetRun[0]?.targetRunId).toBe("run-subject");

      await expect(repository.listByExperimentId("missing")).resolves.toEqual(
        [],
      );
    });

    it("lists eval results by target flow/step/export shape, joining the target run's flow version", async () => {
      await repository.createEvalResult({
        targetRunId: "run-subject",
        targetStepId: "reportForecast",
        targetExportName: "answer",
        evalRunId: "run-eval",
        experimentId: "exp-1",
        overall: 0.75,
        passed: true,
        payload: { overall: 0.75, passed: true, dimensions: {} },
      });

      const byShape = await repository.listByTargetShape({
        flowId: "flow-1",
        stepId: "reportForecast",
        exportName: "answer",
      });
      expect(byShape).toHaveLength(1);
      expect(byShape[0]).toEqual(
        expect.objectContaining({
          targetRunId: "run-subject",
          targetFlowVersionId: "flow-version-1",
        }),
      );

      await expect(
        repository.listByTargetShape({
          flowId: "flow-1",
          stepId: "reportForecast",
          exportName: "no-such-export",
        }),
      ).resolves.toEqual([]);

      await expect(
        repository.listByTargetShape({
          flowId: "some-other-flow",
          stepId: "reportForecast",
          exportName: "answer",
        }),
      ).resolves.toEqual([]);
    });
  });
});
