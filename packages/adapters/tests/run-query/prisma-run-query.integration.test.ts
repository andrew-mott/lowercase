import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  forEachSqlProvider,
  type TestDb,
  type TestSqlClient,
} from "@lcase/test-support";
import { PrismaArtifactRepository } from "../../src/artifact-repository/prisma-artifact-repository.js";
import { PrismaRunQuery } from "../../src/run-query/prisma-run-query.js";

forEachSqlProvider((createDb) => {
  describe("PrismaRunQuery", () => {
    let db: TestDb;
    let prisma: TestSqlClient;
    let query: PrismaRunQuery;

    beforeAll(async () => {
      db = await createDb();
      prisma = db.client;
    });

    afterAll(async () => {
      await db.dispose();
    });

    beforeEach(async () => {
      await db.reset();

      query = new PrismaRunQuery(prisma, new PrismaArtifactRepository(prisma));
    });

    it("lists runs with flow metadata resolved by definition hash", async () => {
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

      await prisma.run.create({
        data: {
          id: "run-1",
          traceId: "trace-1",
          status: "completed",
          source: "lowercase://test",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          flowDefHash: "a".repeat(64),
          forkSpecHash: "b".repeat(64),
          startTime: new Date("2026-07-02T10:00:01.000Z"),
          endTime: new Date("2026-07-02T10:00:05.000Z"),
          duration: 4,
        },
      });

      const result = await query.listRuns();

      expect(result).toEqual([
        {
          runId: "run-1",
          flowName: "Prompt Flow",
          flowVersion: "v1",
          flowDefHash: "a".repeat(64),
          startTime: "2026-07-02T10:00:01.000Z",
          endTime: "2026-07-02T10:00:05.000Z",
          duration: 4,
          forkSpecHash: "b".repeat(64),
          parentId: undefined,
        },
      ]);
    });

    it("lists only runs matching the given flow version id", async () => {
      const createdAt = new Date("2026-07-02T10:00:00.000Z");

      await prisma.flow.create({
        data: {
          id: "flow-1",
          name: "Prompt Flow",
          createdAt,
          updatedAt: createdAt,
          versions: {
            create: [
              {
                id: "flow-version-1",
                sequence: 1,
                definitionHash: "a".repeat(64),
                versionLabel: "v1",
                createdAt,
              },
              {
                id: "flow-version-2",
                sequence: 2,
                definitionHash: "c".repeat(64),
                versionLabel: "v2",
                createdAt,
              },
            ],
          },
        },
      });

      await prisma.run.create({
        data: {
          id: "run-1",
          traceId: "trace-1",
          status: "completed",
          source: "lowercase://test",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          flowDefHash: "a".repeat(64),
        },
      });
      await prisma.run.create({
        data: {
          id: "run-2",
          traceId: "trace-2",
          status: "completed",
          source: "lowercase://test",
          flowId: "flow-1",
          flowVersionId: "flow-version-2",
          flowDefHash: "c".repeat(64),
        },
      });

      const result = await query.listByFlowVersionId("flow-version-1");

      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe("run-1");
    });

    it("returns run detail with step projections", async () => {
      const createdAt = new Date("2026-07-02T10:00:00.000Z");

      await prisma.flow.create({
        data: {
          id: "flow-2",
          name: "Detail Flow",
          createdAt,
          updatedAt: createdAt,
          versions: {
            create: {
              id: "flow-version-2",
              sequence: 1,
              definitionHash: "c".repeat(64),
              versionLabel: "v2",
              createdAt,
            },
          },
        },
      });

      await prisma.run.create({
        data: {
          id: "run-2",
          traceId: "trace-2",
          status: "completed",
          source: "lowercase://detail",
          flowId: "flow-2",
          flowVersionId: "flow-version-2",
          flowDefHash: "c".repeat(64),
          startTime: new Date("2026-07-02T10:00:01.000Z"),
          endTime: new Date("2026-07-02T10:00:03.000Z"),
          duration: 2,
        },
      });

      await prisma.artifact.createMany({
        data: [
          {
            hash: "artifact-prompt",
            time: createdAt,
            label: "Prompt Artifact",
            contentType: "application/json",
            format: "json",
          },
          {
            hash: "artifact-context",
            time: createdAt,
            filename: "context.json",
            contentType: "application/json",
            format: "json",
          },
          {
            hash: "e".repeat(64),
            time: createdAt,
            contentType: "text/plain",
            format: "text",
          },
        ],
      });

      await prisma.runParam.createMany({
        data: [
          { runId: "run-2", name: "prompt", artifactHash: "artifact-prompt" },
          { runId: "run-2", name: "context", artifactHash: "artifact-context" },
        ],
      });

      await prisma.runStepProjection.create({
        data: {
          runId: "run-2",
          stepId: "fetch",
          status: "completed",
          outputHash: "d".repeat(64),
        },
      });

      await prisma.runStepExport.create({
        data: {
          runId: "run-2",
          stepId: "fetch",
          name: "body",
          artifactHash: "e".repeat(64),
        },
      });

      const result = await query.getRunDetail("run-2");

      expect(result).toEqual({
        ok: true,
        value: {
          run: expect.objectContaining({
            id: "run-2",
            flowDefHash: "c".repeat(64),
            status: "completed",
          }),
          params: [
            {
              name: "context",
              artifactHash: "artifact-context",
              artifact: expect.objectContaining({
                hash: "artifact-context",
                filename: "context.json",
                format: "json",
              }),
            },
            {
              name: "prompt",
              artifactHash: "artifact-prompt",
              artifact: expect.objectContaining({
                hash: "artifact-prompt",
                label: "Prompt Artifact",
                format: "json",
              }),
            },
          ],
          steps: [
            {
              runId: "run-2",
              stepId: "fetch",
              status: "completed",
              outputHash: "d".repeat(64),
              exports: [
                {
                  name: "body",
                  artifactHash: "e".repeat(64),
                  artifact: expect.objectContaining({
                    hash: "e".repeat(64),
                    format: "text",
                  }),
                },
              ],
            },
          ],
          flow: expect.objectContaining({
            id: "flow-2",
            name: "Detail Flow",
          }),
          flowVersion: expect.objectContaining({
            id: "flow-version-2",
            definitionHash: "c".repeat(64),
            versionLabel: "v2",
          }),
        },
      });
    });

    it("returns not found for a missing run", async () => {
      await expect(query.getRunDetail("missing-run")).resolves.toEqual({
        ok: false,
        error: "Run not found: missing-run",
      });
    });

    it("returns detail even when flow metadata is missing", async () => {
      await prisma.run.create({
        data: {
          id: "run-3",
          traceId: "trace-3",
          status: "requested",
          source: "lowercase://orphan",
          flowDefHash: "f".repeat(64),
        },
      });

      const result = await query.getRunDetail("run-3");

      expect(result).toEqual({
        ok: true,
        value: {
          run: expect.objectContaining({
            id: "run-3",
            flowDefHash: "f".repeat(64),
          }),
          params: undefined,
          steps: [],
          flow: undefined,
          flowVersion: undefined,
        },
      });
    });

    it("returns params even when artifact metadata is missing", async () => {
      await prisma.run.create({
        data: {
          id: "run-params-missing-metadata",
          traceId: "trace-params",
          status: "completed",
          source: "lowercase://params",
          flowDefHash: "m".repeat(64),
        },
      });

      await prisma.runParam.createMany({
        data: [
          {
            runId: "run-params-missing-metadata",
            name: "prompt",
            artifactHash: "artifact-prompt",
          },
          {
            runId: "run-params-missing-metadata",
            name: "context",
            artifactHash: "artifact-context",
          },
        ],
      });

      await expect(
        query.getRunDetail("run-params-missing-metadata"),
      ).resolves.toEqual({
        ok: true,
        value: {
          run: expect.objectContaining({
            id: "run-params-missing-metadata",
          }),
          params: [
            {
              name: "context",
              artifactHash: "artifact-context",
              artifact: undefined,
            },
            {
              name: "prompt",
              artifactHash: "artifact-prompt",
              artifact: undefined,
            },
          ],
          steps: [],
          flow: undefined,
          flowVersion: undefined,
        },
      });
    });

    it("returns reusable step data for requested step ids", async () => {
      await prisma.run.create({
        data: {
          id: "run-4",
          traceId: "trace-4",
          status: "completed",
          source: "lowercase://reuse",
          flowDefHash: "g".repeat(64),
        },
      });

      await prisma.runStepProjection.createMany({
        data: [
          {
            runId: "run-4",
            stepId: "fetch",
            status: "completed",
            outputHash: "h".repeat(64),
          },
          {
            runId: "run-4",
            stepId: "transform",
            status: "completed",
            outputHash: "j".repeat(64),
          },
        ],
      });

      await prisma.runStepExport.create({
        data: {
          runId: "run-4",
          stepId: "fetch",
          name: "body",
          artifactHash: "i".repeat(64),
        },
      });

      await expect(
        query.getReusableStepData("run-4", ["fetch", "transform"]),
      ).resolves.toEqual({
        ok: true,
        value: {
          fetch: {
            stepId: "fetch",
            status: "completed",
            outputHash: "h".repeat(64),
            exportHashes: { body: "i".repeat(64) },
          },
          transform: {
            stepId: "transform",
            status: "completed",
            outputHash: "j".repeat(64),
            exportHashes: undefined,
          },
        },
      });
    });

    it("returns not found when reusable step data is missing for a requested step", async () => {
      await prisma.run.create({
        data: {
          id: "run-5",
          traceId: "trace-5",
          status: "completed",
          source: "lowercase://reuse-missing",
          flowDefHash: "k".repeat(64),
        },
      });

      await prisma.runStepProjection.create({
        data: {
          runId: "run-5",
          stepId: "fetch",
          status: "completed",
          outputHash: "l".repeat(64),
        },
      });

      await expect(
        query.getReusableStepData("run-5", ["fetch", "transform"]),
      ).resolves.toEqual({
        ok: false,
        error: "Reusable step data not found for stepId: transform",
      });
    });
  });
});
