import { describe, expect, it } from "vitest";
import { materializeHttpRequest } from "../src/protocol/http-json/materialize-http-request.js";
import type { ProtocolRequest } from "../src/job.contracts.js";
import type { Ref } from "@lcase/types";

type HttpProtocol = Extract<ProtocolRequest, { kind: "http" }>;

function protocol(overrides?: Partial<HttpProtocol>): HttpProtocol {
  return {
    kind: "http",
    url: "https://example.test/resource",
    ...overrides,
  };
}

// A whole-value bind (interpolated: false), matching what parse-references's
// isInterpolated computes for a field whose entire value is one `{{...}}`
// token -- exactly the shape an `artifact` body/file part uses.
function audioRef(bindPath: Ref["bindPath"]): Ref {
  return {
    valuePath: ["audio"],
    scope: "params",
    stepId: "step-1",
    bindPath,
    string: "params.audio",
    interpolated: false,
    hash: "some-hash",
    paramType: "audio/wav",
  };
}

describe("materializeHttpRequest", () => {
  it("defaults method to GET when omitted", () => {
    const result = materializeHttpRequest(protocol(), [], {});
    expect(result).toMatchObject({ ok: true, request: { method: "GET" } });
  });

  it("resolves a json body, defaulting Accept and Content-Type", () => {
    const result = materializeHttpRequest(
      protocol({ method: "POST", body: { json: { x: 1 } } }),
      [],
      {},
    );
    expect(result).toEqual({
      ok: true,
      request: {
        url: "https://example.test/resource",
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: { kind: "json", value: { x: 1 } },
      },
    });
  });

  it("does not override an already-provided Accept/Content-Type header", () => {
    const result = materializeHttpRequest(
      protocol({
        method: "POST",
        body: { json: { x: 1 } },
        headers: { "Content-Type": "application/vnd.custom+json" },
      }),
      [],
      {},
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.request.headers["Content-Type"]).toBe(
      "application/vnd.custom+json",
    );
    expect(result.request.headers["Accept"]).toBe("application/json");
  });

  it("rejects a GET with a body", () => {
    const result = materializeHttpRequest(
      protocol({ method: "GET", body: { json: { x: 1 } } }),
      [],
      {},
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a non-http(s) URL scheme", () => {
    const result = materializeHttpRequest(
      protocol({ url: "file:///etc/passwd" }),
      [],
      {},
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed URL", () => {
    const result = materializeHttpRequest(
      protocol({ url: "not a url" }),
      [],
      {},
    );
    expect(result.ok).toBe(false);
  });

  it("binds a resolved ref into the URL via the real bindStepRefs, not custom interpolation", () => {
    const ref: Ref = {
      valuePath: ["url"],
      scope: "params",
      stepId: "step-1",
      bindPath: ["url"],
      string: "params.id",
      interpolated: true,
      hash: "some-hash",
    };
    const result = materializeHttpRequest(
      protocol({ url: "https://example.test/users/{{params.id}}" }),
      [ref],
      { "params.id": "42" },
    );
    if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
    expect(result.request.url).toBe("https://example.test/users/42");
  });

  it("resolves an artifact body, taking its Content-Type from the ref's declared paramType", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const ref = audioRef(["body", "artifact"]);
    const result = materializeHttpRequest(
      protocol({ method: "POST", body: { artifact: "{{params.audio}}" } }),
      [ref],
      { "params.audio": bytes },
    );
    if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
    expect(result.request.body).toEqual({
      kind: "artifact",
      value: { contentType: "audio/wav", bytes },
    });
    expect(result.request.headers["Content-Type"]).toBe("audio/wav");
  });

  it("resolves a multipart body with a string part and a file part, and leaves Content-Type for fetch to set", () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const ref = audioRef(["body", "multipart", "file", "artifact"]);
    const result = materializeHttpRequest(
      protocol({
        method: "POST",
        body: {
          multipart: {
            model: "whisper-1",
            file: { artifact: "{{params.audio}}", filename: "input.wav" },
          },
        },
      }),
      [ref],
      { "params.audio": bytes },
    );
    if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: {
        model: "whisper-1",
        file: { contentType: "audio/wav", bytes, filename: "input.wav" },
      },
    });
    expect(result.request.headers["Content-Type"]).toBeUndefined();
  });
});
