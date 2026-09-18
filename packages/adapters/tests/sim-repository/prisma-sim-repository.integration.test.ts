import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  forEachSqlProvider,
  type TestDb,
  type TestSqlClient,
} from "@lcase/test-support";
import { PrismaFlowRepository } from "../../src/flow-repository/prisma-flow-repository.js";
import { PrismaSimRepository } from "../../src/sim-repository/prisma-sim-repository.js";

forEachSqlProvider((createDb) => {
  describe("PrismaSimRepository", () => {
    let db: TestDb;
    let prisma: TestSqlClient;
    let repository: PrismaSimRepository;
    let flowRepository: PrismaFlowRepository;

    beforeAll(async () => {
      db = await createDb();
      prisma = db.client;
    });

    afterAll(async () => {
      await db.dispose();
    });

    beforeEach(async () => {
      await db.reset();

      repository = new PrismaSimRepository(prisma);
      flowRepository = new PrismaFlowRepository(prisma);
    });

    it("creates and reads a sim record", async () => {
      const flowResult = await flowRepository.createFlow({
        name: "Prompt Flow",
        definitionHash: "a".repeat(64),
        versionLabel: "v1",
      });
      expect(flowResult.ok).toBe(true);
      if (!flowResult.ok) return;

      const result = await repository.createSim({
        name: "Reuse Fetch",
        flowId: flowResult.value.flow.id,
        flowVersionId: flowResult.value.version.id,
        forkSpecHash: "b".repeat(64),
      });

      expect(result.ok).toBe(true);
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id: expect.any(String),
          name: "Reuse Fetch",
          flowId: flowResult.value.flow.id,
          flowVersionId: flowResult.value.version.id,
          forkSpecHash: "b".repeat(64),
        }),
      });

      if (!result.ok) return;
      await expect(repository.getSim(result.value.id)).resolves.toEqual({
        ok: true,
        value: expect.objectContaining({
          id: result.value.id,
          name: "Reuse Fetch",
        }),
      });
    });

    it("rejects a flow version that belongs to another flow", async () => {
      const firstFlow = await flowRepository.createFlow({
        name: "Flow A",
        definitionHash: "a".repeat(64),
        versionLabel: "v1",
      });
      const secondFlow = await flowRepository.createFlow({
        name: "Flow B",
        definitionHash: "b".repeat(64),
        versionLabel: "v1",
      });

      expect(firstFlow.ok).toBe(true);
      expect(secondFlow.ok).toBe(true);
      if (!firstFlow.ok || !secondFlow.ok) return;

      const result = await repository.createSim({
        name: "Bad Sim",
        flowId: firstFlow.value.flow.id,
        flowVersionId: secondFlow.value.version.id,
        forkSpecHash: "c".repeat(64),
      });

      expect(result).toEqual({
        ok: false,
        error: "Flow version does not belong to the supplied flow",
      });
    });

    it("lists sims newest first with flow and version summaries", async () => {
      const firstFlow = await flowRepository.createFlow({
        name: "Flow A",
        definitionHash: "a".repeat(64),
        versionLabel: "v1",
      });
      const secondFlow = await flowRepository.createFlow({
        name: "Flow B",
        definitionHash: "b".repeat(64),
        versionLabel: "v2",
      });
      expect(firstFlow.ok).toBe(true);
      expect(secondFlow.ok).toBe(true);
      if (!firstFlow.ok || !secondFlow.ok) return;

      const firstSim = await repository.createSim({
        name: "First Sim",
        flowId: firstFlow.value.flow.id,
        flowVersionId: firstFlow.value.version.id,
        forkSpecHash: "1".repeat(64),
      });
      const secondSim = await repository.createSim({
        name: "Second Sim",
        flowId: secondFlow.value.flow.id,
        flowVersionId: secondFlow.value.version.id,
        forkSpecHash: "2".repeat(64),
      });
      expect(firstSim.ok).toBe(true);
      expect(secondSim.ok).toBe(true);

      const sims = await repository.listSimsWithFlowVersion();
      expect(sims).toHaveLength(2);
      expect(sims[0]).toEqual({
        sim: expect.objectContaining({
          name: "Second Sim",
          flowId: secondFlow.value.flow.id,
          flowVersionId: secondFlow.value.version.id,
        }),
        flow: expect.objectContaining({
          id: secondFlow.value.flow.id,
          name: "Flow B",
        }),
        flowVersion: expect.objectContaining({
          id: secondFlow.value.version.id,
          versionLabel: "v2",
        }),
      });
      expect(sims[1]?.sim.name).toBe("First Sim");
    });

    it("lists only sims matching the given flow version id", async () => {
      const firstFlow = await flowRepository.createFlow({
        name: "Flow A",
        definitionHash: "a".repeat(64),
        versionLabel: "v1",
      });
      const secondFlow = await flowRepository.createFlow({
        name: "Flow B",
        definitionHash: "b".repeat(64),
        versionLabel: "v2",
      });
      expect(firstFlow.ok).toBe(true);
      expect(secondFlow.ok).toBe(true);
      if (!firstFlow.ok || !secondFlow.ok) return;

      await repository.createSim({
        name: "First Sim",
        flowId: firstFlow.value.flow.id,
        flowVersionId: firstFlow.value.version.id,
        forkSpecHash: "1".repeat(64),
      });
      await repository.createSim({
        name: "Second Sim",
        flowId: secondFlow.value.flow.id,
        flowVersionId: secondFlow.value.version.id,
        forkSpecHash: "2".repeat(64),
      });

      const sims = await repository.listSimsByFlowVersionId(
        firstFlow.value.version.id,
      );
      expect(sims).toHaveLength(1);
      expect(sims[0]?.sim.name).toBe("First Sim");
    });
  });
});
