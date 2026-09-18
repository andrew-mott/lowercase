import { describe, expect, it } from "vitest";
import { materializeHttpJsonRequest } from "../src/protocol/http-json/materialize-http-json-request.js";
import type { ProtocolRequest } from "../src/job.contracts.js";
import type { Ref } from "@lcase/types";

function protocol(overrides?: Partial<ProtocolRequest>): ProtocolRequest {
  return {
    kind: "httpjson",
    url: "https://example.test/resource",
    ...overrides,
  };
}

describe("materializeHttpJsonRequest", () => {
  it("defaults method to GET when omitted", () => {
    const result = materializeHttpJsonRequest(protocol(), [], {});
    expect(result).toMatchObject({ ok: true, request: { method: "GET" } });
  });

  it("defaults Accept and Content-Type only when not already provided", () => {
    const result = materializeHttpJsonRequest(
      protocol({ method: "POST", body: { x: 1 } }),
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
        json: { x: 1 },
      },
    });
  });

  it("does not override an already-provided Accept/Content-Type header", () => {
    const result = materializeHttpJsonRequest(
      protocol({
        method: "POST",
        body: { x: 1 },
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
    const result = materializeHttpJsonRequest(
      protocol({ method: "GET", body: { x: 1 } }),
      [],
      {},
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a non-http(s) URL scheme", () => {
    const result = materializeHttpJsonRequest(
      protocol({ url: "file:///etc/passwd" }),
      [],
      {},
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed URL", () => {
    const result = materializeHttpJsonRequest(
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
    const result = materializeHttpJsonRequest(
      protocol({ url: "https://example.test/users/{{params.id}}" }),
      [ref],
      { "params.id": "42" },
    );
    if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
    expect(result.request.url).toBe("https://example.test/users/42");
  });
});
