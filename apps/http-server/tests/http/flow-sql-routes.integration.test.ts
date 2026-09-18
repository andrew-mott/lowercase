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
import { FsArtifactStore } from "@lcase/adapters/artifact-store";
import { PrismaFlowRepository } from "@lcase/adapters/flow-repository";
import { createArtifactReadWritePort } from "@lcase/artifacts";
import { FlowService } from "@lcase/app-services";
import type { FlowDefinition } from "@lcase/types";
import { postFlowsRoute } from "../../src/http/routes/flows/post.js";
import { postFlowsFilesRoute } from "../../src/http/routes/flows/files/post.js";
import { getFlowDefRoute } from "../../src/http/routes/flows/get-flow-def.js";
import { listFlowsRoute } from "../../src/http/routes/flows/get.js";
import {
  getFlowVersionRoute,
  listFlowVersionsRoute,
} from "../../src/http/routes/flows/get-versions.js";

describe("flow routes", () => {
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
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lcase-flow-sql-route-"));
    artifactDir = path.join(tmpDir, "artifacts");

    await db.reset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("uses the main flow routes with SQL-backed metadata", async () => {
    const artifacts = createArtifactReadWritePort(
      new FsArtifactStore(artifactDir),
      new PrismaArtifactRepository(prisma),
    );
    const flowService = new FlowService(
      artifacts,
      new PrismaFlowRepository(prisma),
    );

    const app = Fastify();
    await app.register(import("@fastify/multipart"));
    app.decorate("services", {
      flow: flowService,
    } as unknown as ServicesPort);

    await app.register(listFlowsRoute, { prefix: "/api/flows" });
    await app.register(listFlowVersionsRoute, { prefix: "/api/flows" });
    await app.register(getFlowVersionRoute, { prefix: "/api/flows" });
    await app.register(getFlowDefRoute, { prefix: "/api/flows" });
    await app.register(postFlowsRoute, { prefix: "/api/flows" });
    await app.register(postFlowsFilesRoute, { prefix: "/api/flows/files" });

    const flowDefinition: FlowDefinition = {
      name: "Prompt Flow",
      version: "v1",
      description: "Reusable flow",
      params: {
        prompt: {
          type: "text/markdown",
        },
        payload: {
          type: "application/json",
          optional: true,
        },
      },
      start: "fetch",
      steps: {
        fetch: {
          type: "httpjson",
          url: "https://example.com/api",
        },
      },
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/flows",
      payload: flowDefinition,
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      ok: true;
      value: {
        flow: {
          id: string;
          name: string;
          description?: string;
        };
        version: {
          id: string;
          flowId: string;
          sequence: number;
          definitionHash: string;
          versionLabel?: string;
        };
      };
    };

    expect(body.ok).toBe(true);
    expect(body.value.flow.name).toBe("Prompt Flow");
    expect(body.value.version.sequence).toBe(1);
    expect(body.value.version.definitionHash).toMatch(/^[a-f0-9]{64}$/);

    const storedFlows = await prisma.flow.findMany();
    const storedVersions = await prisma.flowVersion.findMany();
    expect(storedFlows).toHaveLength(1);
    expect(storedVersions).toHaveLength(1);
    expect(storedVersions[0]?.flowId).toBe(body.value.flow.id);
    expect(storedVersions[0]?.definitionHash).toBe(
      body.value.version.definitionHash,
    );

    const artifact = await artifacts.load(
      body.value.version.definitionHash,
      "application/json",
    );
    expect(artifact.ok).toBe(true);
    if (artifact.ok) {
      expect(artifact.value).toEqual(flowDefinition);
    }

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/flows",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      ok: true,
      value: [
        {
          flow: expect.objectContaining({
            id: body.value.flow.id,
            name: "Prompt Flow",
            description: "Reusable flow",
          }),
          latestVersion: expect.objectContaining({
            id: body.value.version.id,
            flowId: body.value.flow.id,
            sequence: 1,
            definitionHash: body.value.version.definitionHash,
            versionLabel: "v1",
          }),
        },
      ],
    });

    const flowDefResponse = await app.inject({
      method: "GET",
      url: `/api/flows/${body.value.flow.id}`,
    });
    expect(flowDefResponse.statusCode).toBe(200);
    expect(flowDefResponse.json()).toEqual({
      ok: true,
      value: flowDefinition,
    });

    const versionsResponse = await app.inject({
      method: "GET",
      url: `/api/flows/${body.value.flow.id}/versions`,
    });
    expect(versionsResponse.statusCode).toBe(200);
    expect(versionsResponse.json()).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          id: body.value.version.id,
          flowId: body.value.flow.id,
          sequence: 1,
          definitionHash: body.value.version.definitionHash,
          versionLabel: "v1",
        }),
      ],
    });

    const versionResponse = await app.inject({
      method: "GET",
      url: `/api/flows/versions/${body.value.version.id}`,
    });
    expect(versionResponse.statusCode).toBe(200);
    expect(versionResponse.json()).toEqual({
      ok: true,
      value: {
        version: expect.objectContaining({
          id: body.value.version.id,
          flowId: body.value.flow.id,
          sequence: 1,
          definitionHash: body.value.version.definitionHash,
          versionLabel: "v1",
        }),
        definition: flowDefinition,
      },
    });

    const missingVersionsResponse = await app.inject({
      method: "GET",
      url: "/api/flows/missing-flow/versions",
    });
    expect(missingVersionsResponse.statusCode).toBe(200);
    expect(missingVersionsResponse.json()).toEqual({
      ok: false,
      error: "Flow not found: missing-flow",
    });

    const missingVersionResponse = await app.inject({
      method: "GET",
      url: "/api/flows/versions/missing-version",
    });
    expect(missingVersionResponse.statusCode).toBe(200);
    expect(missingVersionResponse.json()).toEqual({
      ok: false,
      error: "Flow version not found: missing-version",
    });

    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/flows/files",
      payload: makeMultipartBody(
        JSON.stringify({
          ...flowDefinition,
          name: "Uploaded Flow",
          version: "v2",
        }),
        "uploaded-flow.json",
        "application/json",
      ),
      headers: makeMultipartHeaders(),
    });
    expect(uploadResponse.statusCode).toBe(200);
    const uploadBody = uploadResponse.json() as {
      ok: true;
      value: {
        flow: { id: string; name: string };
        version: { definitionHash: string };
      };
    };
    expect(uploadBody.ok).toBe(true);
    expect(uploadBody.value.flow.name).toBe("Uploaded Flow");
    expect(uploadBody.value.version.definitionHash).toMatch(/^[a-f0-9]{64}$/);

    const storedFlowCount = await prisma.flow.count();
    const storedVersionCount = await prisma.flowVersion.count();
    expect(storedFlowCount).toBe(2);
    expect(storedVersionCount).toBe(2);

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
) {
  return [
    `--${multipartBoundary}`,
    `Content-Disposition: form-data; name="files"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    "",
    content,
    `--${multipartBoundary}--`,
    "",
  ].join("\r\n");
}
