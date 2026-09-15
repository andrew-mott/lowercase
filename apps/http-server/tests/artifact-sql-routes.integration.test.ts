import Fastify from "fastify";
import type { ServicesPort } from "@lcase/ports";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
import { getArtifactRoute } from "../src/routes/artifacts/get-artifact.js";
import { listArtifactsRoute } from "../src/routes/artifacts/list-artifacts.js";
import { postArtifactRoute } from "../src/routes/artifacts/post-artifact.js";
import { patchArtifactRoute } from "../src/routes/artifacts/patch-artifact.js";
import type { FlowDefinition, JsonValue } from "@lcase/types";

describe("artifact sql routes", () => {
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
      path.join(os.tmpdir(), "lcase-artifact-sql-route-"),
    );
    artifactDir = path.join(tmpDir, "artifacts");

    await db.reset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("stores artifact metadata in SQL while reading content from CAS", async () => {
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
    await app.register(import("@fastify/multipart"));
    app.decorate("services", {
      artifact: artifactService,
    } as unknown as ServicesPort);

    await app.register(listArtifactsRoute, { prefix: "/api/artifacts" });
    await app.register(getArtifactRoute, { prefix: "/api/artifacts" });
    await app.register(postArtifactRoute, { prefix: "/api/artifacts" });
    await app.register(patchArtifactRoute, { prefix: "/api/artifacts" });

    const jsonResponse = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: {
        contentType: "application/json",
        value: JSON.stringify({ hello: "world" }),
        metadata: { label: "Prompt" },
      },
    });
    expect(jsonResponse.statusCode).toBe(200);
    const jsonBody = jsonResponse.json() as {
      ok: true;
      value: { hash: string };
    };
    expect(jsonBody.ok).toBe(true);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          artifact: expect.objectContaining({
            hash: jsonBody.value.hash,
            label: "Prompt",
            contentType: "application/json",
            format: "json",
          }),
          associations: expect.objectContaining({
            // creation through the unified route always curates -- unlike
            // the old JSON-only route, which called putArtifact() and never
            // curated
            curated: true,
            paramCurations: [],
          }),
        }),
      ],
    });

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/artifacts/${jsonBody.value.hash}`,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      ok: true,
      format: "json",
      value: { hello: "world" },
    });

    const fileResponse = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: makeMultipartBody("# prompt", "prompt.md", "text/markdown", {
        metadata: JSON.stringify({ label: "Markdown Prompt" }),
      }),
      headers: makeMultipartHeaders(),
    });
    expect(fileResponse.statusCode).toBe(200);
    const fileBody = fileResponse.json() as {
      ok: true;
      value: { hash: string };
    };
    expect(fileBody.ok).toBe(true);

    const storedMetadata = await prisma.artifact.findMany({
      orderBy: [{ time: "desc" }, { hash: "desc" }],
    });
    expect(storedMetadata).toHaveLength(2);
    expect(
      storedMetadata.some((artifact) => artifact.hash === jsonBody.value.hash),
    ).toBe(true);
    expect(
      storedMetadata.some(
        (artifact) =>
          artifact.hash === fileBody.value.hash &&
          artifact.label === "Markdown Prompt" &&
          artifact.filename === "prompt.md" &&
          artifact.contentType === "text/markdown" &&
          artifact.format === "markdown",
      ),
    ).toBe(true);

    const markdown = await artifacts.load(fileBody.value.hash, "text/markdown");
    expect(markdown).toEqual({ ok: true, value: "# prompt" });

    await app.close();
  });

  it("PATCH /api/artifacts/:hash associates and toggles curated", async () => {
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
    await app.register(import("@fastify/multipart"));
    await app.register(postArtifactRoute, { prefix: "/api/artifacts" });
    await app.register(patchArtifactRoute, { prefix: "/api/artifacts" });

    const putResponse = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: {
        contentType: "application/json",
        value: JSON.stringify({ hello: "world" }),
      },
    });
    const hash = (putResponse.json() as { value: { hash: string } }).value.hash;

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/artifacts/${hash}`,
      payload: { label: "renamed" },
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual({
      ok: true,
      // curated is set unconditionally by updateMetadata -- not because the
      // payload asked for it, ArtifactUpdateMetadata has no `curated` field at all
      value: expect.objectContaining({ hash, label: "renamed", curated: true }),
    });

    const invalidHashResponse = await app.inject({
      method: "PATCH",
      url: "/api/artifacts/not-a-hash",
      payload: { label: "renamed" },
    });
    expect(invalidHashResponse.json()).toEqual({
      ok: false,
      error: "Invalid hash",
    });

    await app.close();
  });

  it("GET /api/artifacts filters by flowId, flowVersionId, and curated", async () => {
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
    await app.register(listArtifactsRoute, { prefix: "/api/artifacts" });

    const flow = await prisma.flow.create({ data: { name: "Test Flow" } });
    const flowVersion = await prisma.flowVersion.create({
      data: { flowId: flow.id, sequence: 1, definitionHash: "h".repeat(64) },
    });

    const curatedResult = await artifactRepository.writeArtifact({
      hash: "a".repeat(64),
      time: "2026-01-01T00:00:00.000Z",
      format: "json",
    });
    expect(curatedResult.ok).toBe(true);
    await artifactRepository.updateMetadata("a".repeat(64), {
      flowId: flow.id,
      flowVersionId: flowVersion.id,
    });
    await artifactRepository.writeArtifact({
      hash: "b".repeat(64),
      time: "2026-01-02T00:00:00.000Z",
      format: "json",
    });

    const curatedOnly = await app.inject({
      method: "GET",
      url: "/api/artifacts?curated=true",
    });
    expect(curatedOnly.json()).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          artifact: expect.objectContaining({ hash: "a".repeat(64) }),
        }),
      ],
    });

    const byFlowVersion = await app.inject({
      method: "GET",
      url: `/api/artifacts?flowVersionId=${flowVersion.id}`,
    });
    expect(byFlowVersion.json()).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          artifact: expect.objectContaining({ hash: "a".repeat(64) }),
        }),
      ],
    });

    const unfiltered = await app.inject({
      method: "GET",
      url: "/api/artifacts",
    });
    expect((unfiltered.json() as { value: unknown[] }).value).toHaveLength(2);

    await app.close();
  });

  it("GET /api/artifacts includes paramCurations when scoped by flowVersionId", async () => {
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
    await app.register(listArtifactsRoute, { prefix: "/api/artifacts" });
    await app.register(patchArtifactRoute, { prefix: "/api/artifacts" });

    const definition: FlowDefinition = {
      name: "Weather Flow",
      version: "v1",
      params: { weatherApiKey: { type: "text/plain" } },
      start: "fetch",
      steps: { fetch: { type: "httpjson", url: "https://example.com" } },
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
      data: { flowId: flow.id, sequence: 1, definitionHash: defResult.hash },
    });

    await artifactRepository.writeArtifact({
      hash: "a".repeat(64),
      time: "2026-01-01T00:00:00.000Z",
      contentType: "text/plain",
      format: "text",
    });

    const curateResponse = await app.inject({
      method: "PATCH",
      url: `/api/artifacts/${"a".repeat(64)}`,
      payload: {
        flowVersionId: flowVersion.id,
        paramCurations: ["weatherApiKey"],
      },
    });
    expect(curateResponse.statusCode).toBe(200);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/artifacts?flowVersionId=${flowVersion.id}`,
    });
    expect(listResponse.json()).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          artifact: expect.objectContaining({ hash: "a".repeat(64) }),
          associations: expect.objectContaining({
            paramCurations: [
              { flowVersionId: flowVersion.id, paramName: "weatherApiKey" },
            ],
          }),
        }),
      ],
    });

    await app.close();
  });
});

const multipartBoundary = `----lcase-${randomUUID()}`;

function makeMultipartHeaders() {
  return {
    "content-type": `multipart/form-data; boundary=${multipartBoundary}`,
  };
}

function makeMultipartBody(
  content: string,
  filename: string,
  contentType: string,
  fields: Record<string, string> = {},
) {
  return [
    `--${multipartBoundary}`,
    ...Object.entries(fields).flatMap(([name, value]) => [
      `Content-Disposition: form-data; name="${name}"`,
      "",
      value,
      `--${multipartBoundary}`,
    ]),
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    "",
    content,
    `--${multipartBoundary}--`,
    "",
  ].join("\r\n");
}
