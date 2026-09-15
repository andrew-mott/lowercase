import Fastify from "fastify";
import type { ServicesPort } from "@lcase/ports";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { postArtifactRoute } from "../src/routes/artifacts/post-artifact.js";

// postArtifactRoute checks req.isMultipart() unconditionally, even for the
// JSON branch, so @fastify/multipart must be registered regardless of
// which branch a given test exercises -- matching how build-server.ts
// registers it globally in production, not per-route
async function buildApp(
  createArtifact = vi.fn().mockResolvedValue({ ok: true, value: "hash" }),
) {
  const app = Fastify();
  app.decorate("services", {
    artifact: { createArtifact },
  } as unknown as ServicesPort);
  await app.register(multipart);
  await app.register(postArtifactRoute);
  return { app, createArtifact };
}

describe("post-artifact route -- authored (JSON) branch", () => {
  it("maps application/json to format json and passes contentType/metadata through", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: {
        contentType: "application/json",
        value: JSON.stringify({ hello: "world" }),
        metadata: { label: "Prompt" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(createArtifact).toHaveBeenCalledWith(
      {
        format: "json",
        value: { hello: "world" },
        index: { contentType: "application/json" },
      },
      { label: "Prompt" },
    );
  });

  it("400s on malformed JSON when contentType is application/json, without calling createArtifact", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: { contentType: "application/json", value: "{not valid json" },
    });

    expect(response.statusCode).toBe(400);
    expect(createArtifact).not.toHaveBeenCalled();
  });

  it("accepts a bare JSON string as the value -- a legitimate json-format artifact, not a mistake", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: {
        contentType: "application/json",
        value: JSON.stringify("just a string"),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(createArtifact).toHaveBeenCalledWith(
      {
        format: "json",
        value: "just a string",
        index: { contentType: "application/json" },
      },
      undefined,
    );
  });

  it("maps text/markdown to format markdown, preserving the exact MIME string given", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: { contentType: "text/x-markdown", value: "# hi" },
    });

    expect(response.statusCode).toBe(200);
    expect(createArtifact).toHaveBeenCalledWith(
      {
        format: "markdown",
        value: "# hi",
        index: { contentType: "text/x-markdown" },
      },
      undefined,
    );
  });

  it("rejects an unmapped contentType with 400, never falling back to bytes", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: { contentType: "application/octet-stream", value: "whatever" },
    });

    expect(response.statusCode).toBe(400);
    expect(createArtifact).not.toHaveBeenCalled();
  });

  it("has no way to set curated through the request body -- it's not a field on the wire type", async () => {
    const { app, createArtifact } = await buildApp();

    await app.inject({
      method: "POST",
      url: "/",
      payload: {
        contentType: "application/json",
        value: JSON.stringify({ hello: "world" }),
        metadata: { curated: true, label: "x" },
      },
    });

    // whatever the client sent under metadata.curated is passed straight
    // through to the service unexamined -- enforcement that curated always
    // ends up true lives in ArtifactService.createArtifact, not the route
    expect(createArtifact).toHaveBeenCalledWith(
      {
        format: "json",
        value: { hello: "world" },
        index: { contentType: "application/json" },
      },
      { curated: true, label: "x" },
    );
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

describe("post-artifact route -- multipart (file upload) branch", () => {
  it("detects a json file upload and passes filename/contentType through", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: makeMultipartBody(
        JSON.stringify({ hello: "world" }),
        "data.json",
        "application/json",
        { metadata: JSON.stringify({ label: "Prompt" }) },
      ),
      headers: makeMultipartHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(createArtifact).toHaveBeenCalledWith(
      {
        format: "json",
        value: { hello: "world" },
        index: { filename: "data.json", contentType: "application/json" },
      },
      { label: "Prompt" },
    );
  });

  it("falls back to format bytes for an upload that doesn't match json/text/markdown", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: makeMultipartBody("\x01\x02\x03", "photo.png", "image/png"),
      headers: makeMultipartHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(createArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "bytes",
        index: { filename: "photo.png", contentType: "image/png" },
      }),
      undefined,
    );
  });

  it("400s when no file part is present", async () => {
    const { app, createArtifact } = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: [
        `--${multipartBoundary}`,
        `Content-Disposition: form-data; name="metadata"`,
        "",
        JSON.stringify({ label: "no file here" }),
        `--${multipartBoundary}--`,
        "",
      ].join("\r\n"),
      headers: makeMultipartHeaders(),
    });

    expect(response.statusCode).toBe(400);
    expect(createArtifact).not.toHaveBeenCalled();
  });
});
