import Fastify from "fastify";
import type { ServicesPort } from "@lcase/ports";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createSqliteTestDb,
  type TestDb,
  type TestSqlClient,
} from "@lcase/test-support";
import { InMemoryEventBus } from "@lcase/adapters/event-bus";
import { PrismaArtifactRepository } from "@lcase/adapters/artifact-repository";
import { PrismaFlowRepository } from "@lcase/adapters/flow-repository";
import { PrismaSimRepository } from "@lcase/adapters/sim-repository";
import { FsArtifactStore } from "@lcase/adapters/artifact-store";
import { createArtifactReadWritePort } from "@lcase/artifacts";
import { EmitterFactory } from "@lcase/events";
import type { RunQueryPort } from "@lcase/ports";
import { SimService } from "@lcase/app-services";
import { getSimSpecRoute } from "../src/routes/sims/get-sim-spec.js";
import { simsListRoute } from "../src/routes/sims/list.js";
import { postSimsRoute } from "../src/routes/sims/post.js";

describe("sim sql routes", () => {
  let db: TestDb;
  let tmpDir: string;
  let artifactDir: string;
  let prisma: TestSqlClient;

  beforeAll(async () => {
    db = await createSqliteTestDb();
    prisma = db.client;
  });

  afterAll(async () => {
    await db.dispose();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcase-sim-sql-route-"));
    artifactDir = path.join(tmpDir, "artifacts");

    await db.reset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("stores sim metadata in SQL while reading fork specs from CAS", async () => {
    const artifacts = createArtifactReadWritePort(
      new FsArtifactStore(artifactDir),
      new PrismaArtifactRepository(prisma),
    );
    const flowRepository = new PrismaFlowRepository(prisma);
    const simRepository = new PrismaSimRepository(prisma);
    const flowResult = await flowRepository.createFlow({
      name: "Prompt Flow",
      description: "Reusable flow",
      definitionHash: "a".repeat(64),
      versionLabel: "v1",
    });
    const secondFlowResult = await flowRepository.createFlow({
      name: "Other Flow",
      definitionHash: "b".repeat(64),
      versionLabel: "v1",
    });
    expect(flowResult.ok).toBe(true);
    expect(secondFlowResult.ok).toBe(true);
    if (!flowResult.ok || !secondFlowResult.ok) return;

    const simService = new SimService(
      artifacts,
      new EmitterFactory(new InMemoryEventBus()),
      {
        listRuns: async () => [],
        listByFlowVersionId: async () => [],
        getRunDetail: async () => ({
          ok: false,
          error: "unused",
        }),
        getReusableStepData: async () => ({
          ok: false,
          error: "unused",
        }),
      } satisfies RunQueryPort,
      simRepository,
      flowRepository,
    );

    const app = Fastify();
    app.decorate("services", {
      sim: simService,
    } as unknown as ServicesPort);

    await app.register(simsListRoute, { prefix: "/api/sims" });
    await app.register(postSimsRoute, { prefix: "/api/sims" });
    await app.register(getSimSpecRoute, { prefix: "/api/sims" });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/sims",
      payload: {
        name: "Reuse Fetch",
        flowId: flowResult.value.flow.id,
        flowVersionId: flowResult.value.version.id,
        parentRunId: "run-test",
        reuse: ["fetch"],
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const createBody = createResponse.json() as {
      ok: true;
      value: {
        id: string;
        flowId: string;
        flowVersionId: string;
        forkSpecHash: string;
      };
    };
    expect(createBody.ok).toBe(true);
    expect(createBody.value.flowId).toBe(flowResult.value.flow.id);
    expect(createBody.value.flowVersionId).toBe(flowResult.value.version.id);

    const simRows = await prisma.sim.findMany();
    expect(simRows).toHaveLength(1);
    expect(simRows[0]?.id).toBe(createBody.value.id);
    expect(simRows[0]?.forkSpecHash).toBe(createBody.value.forkSpecHash);

    const storedForkSpec = await artifacts.load(
      createBody.value.forkSpecHash,
      "application/json",
    );
    expect(storedForkSpec).toEqual({
      ok: true,
      value: {
        parentRunId: "run-test",
        reuse: ["fetch"],
      },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/sims",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      ok: true,
      value: [
        {
          sim: expect.objectContaining({
            id: createBody.value.id,
            name: "Reuse Fetch",
            flowId: flowResult.value.flow.id,
            flowVersionId: flowResult.value.version.id,
            forkSpecHash: createBody.value.forkSpecHash,
          }),
          flow: expect.objectContaining({
            id: flowResult.value.flow.id,
            name: "Prompt Flow",
          }),
          flowVersion: expect.objectContaining({
            id: flowResult.value.version.id,
            versionLabel: "v1",
            definitionHash: "a".repeat(64),
          }),
        },
      ],
    });

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/sims/${createBody.value.id}`,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      ok: true,
      value: {
        sim: expect.objectContaining({
          id: createBody.value.id,
          flowId: flowResult.value.flow.id,
          flowVersionId: flowResult.value.version.id,
          forkSpecHash: createBody.value.forkSpecHash,
        }),
        spec: {
          parentRunId: "run-test",
          reuse: ["fetch"],
        },
      },
    });

    const invalidResponse = await app.inject({
      method: "POST",
      url: "/api/sims",
      payload: {
        name: "Bad Sim",
        flowId: flowResult.value.flow.id,
        flowVersionId: secondFlowResult.value.version.id,
        parentRunId: "run-test",
        reuse: ["fetch"],
      },
    });
    expect(invalidResponse.statusCode).toBe(200);
    expect(invalidResponse.json()).toEqual({
      ok: false,
      error: "Flow version does not belong to the supplied flow",
    });

    await app.close();
  });
});
