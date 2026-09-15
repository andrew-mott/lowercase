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
import { PrismaArtifactRepository } from "@lcase/adapters/artifact-repository";
import { PrismaFlowRepository } from "@lcase/adapters/flow-repository";
import { FsArtifactStore } from "@lcase/adapters/artifact-store";
import { createArtifactReadWritePort } from "@lcase/artifacts";
import { ArtifactService } from "@lcase/app-services";
import type { FlowDefinition, JsonValue } from "@lcase/types";
import { getCuratedArtifactsForParamRoute } from "../src/routes/flows/curated-artifacts.js";
import { patchArtifactRoute } from "../src/routes/artifacts/patch-artifact.js";

describe("GET .../curated-artifacts", () => {
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
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lcase-curated-artifacts-route-"),
    );
    artifactDir = path.join(tmpDir, "artifacts");

    await db.reset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setUp() {
    const artifactRepository = new PrismaArtifactRepository(prisma);
    const flowRepository = new PrismaFlowRepository(prisma);
    const artifacts = createArtifactReadWritePort(
      new FsArtifactStore(artifactDir),
      artifactRepository,
    );
    const artifactService = new ArtifactService(
      artifacts,
      artifactRepository,
      flowRepository,
    );

    const app = Fastify();
    app.decorate("services", {
      artifact: artifactService,
    } as unknown as ServicesPort);
    await app.register(getCuratedArtifactsForParamRoute, {
      prefix: "/api/flows",
    });
    await app.register(patchArtifactRoute, { prefix: "/api/artifacts" });

    const definition: FlowDefinition = {
      name: "Weather Flow",
      version: "v1",
      params: {
        weatherApiKey: { type: "text/plain" },
      },
      start: "fetch",
      steps: {
        fetch: { type: "httpjson", url: "https://example.com" },
      },
    };
    const defResult = await artifacts.save(
      definition as JsonValue,
      "application/json",
    );
    if (defResult.status === "failed") {
      throw new Error("failed to store flow definition");
    }

    const flow = await prisma.flow.create({ data: { name: "Weather Flow" } });
    const flowVersion = await prisma.flowVersion.create({
      data: {
        flowId: flow.id,
        sequence: 1,
        definitionHash: defResult.hash,
      },
    });

    await artifactRepository.writeArtifact({
      hash: "a".repeat(64),
      time: "2026-01-01T00:00:00.000Z",
      contentType: "text/plain",
      format: "text",
    });

    return { app, artifactRepository, flow, flowVersion };
  }

  it("returns artifacts curated for that param via the unified PATCH", async () => {
    const { app, flowVersion } = await setUp();

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/artifacts/${"a".repeat(64)}`,
      payload: {
        flowVersionId: flowVersion.id,
        paramCurations: ["weatherApiKey"],
      },
    });
    expect(patchResponse.statusCode).toBe(200);

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/flows/versions/${flowVersion.id}/params/weatherApiKey/curated-artifacts`,
    });
    expect(getResponse.json()).toEqual({
      ok: true,
      value: [expect.objectContaining({ hash: "a".repeat(64) })],
    });

    await app.close();
  });

  it("returns an empty list once curation is removed", async () => {
    const { app, flowVersion } = await setUp();

    await app.inject({
      method: "PATCH",
      url: `/api/artifacts/${"a".repeat(64)}`,
      payload: {
        flowVersionId: flowVersion.id,
        paramCurations: ["weatherApiKey"],
      },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/artifacts/${"a".repeat(64)}`,
      payload: { flowVersionId: flowVersion.id, paramCurations: [] },
    });

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/flows/versions/${flowVersion.id}/params/weatherApiKey/curated-artifacts`,
    });
    expect(getResponse.json()).toEqual({ ok: true, value: [] });

    await app.close();
  });
});
