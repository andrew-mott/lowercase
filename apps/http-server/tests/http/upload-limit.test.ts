import type { ObservabilityTapPort, ServicesPort } from "@lcase/ports";
import { describe, expect, it, vi } from "vitest";
import { buildServer, maxUploadBytes } from "../../src/http/build-server.js";

const boundary = "----lcase-upload-limit";

function multipartUpload(size: number) {
  const head = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="input.wav"`,
      "Content-Type: audio/wav",
      "",
      "",
    ].join("\r\n"),
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, Buffer.alloc(size), tail]);
}

async function serve() {
  const createArtifact = vi.fn().mockResolvedValue({ ok: true, value: "hash" });
  const app = await buildServer({
    services: { artifact: { createArtifact } } as unknown as ServicesPort,
    tap: {} as ObservabilityTapPort,
  });
  return { app, createArtifact };
}

describe("artifact upload size limit", () => {
  it("accepts a file exactly at the limit", async () => {
    const { app, createArtifact } = await serve();

    const response = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: multipartUpload(maxUploadBytes),
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });

    expect(response.statusCode).toBe(200);
    expect(createArtifact).toHaveBeenCalledOnce();
    await app.close();
  });

  it("answers 413 for a file over the limit, without creating an artifact", async () => {
    const { app, createArtifact } = await serve();

    const response = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: multipartUpload(maxUploadBytes + 1),
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });

    expect(response.statusCode).toBe(413);
    expect(createArtifact).not.toHaveBeenCalled();
    await app.close();
  });
});
