import { describe, expect, it, vi } from "vitest";
import { createHttpJsonExecutor } from "../src/protocol/http-json/http-json.executor.js";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.js";
import type { ResolvedHttpJsonRequest } from "../src/protocol/http-json/http-json.types.js";

function req(
  overrides?: Partial<ResolvedHttpJsonRequest>,
): ResolvedHttpJsonRequest {
  return {
    url: "https://example.test/resource",
    method: "GET",
    headers: {},
    ...overrides,
  };
}

describe("createHttpJsonExecutor", () => {
  it("200 with a JSON body succeeds", async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse(200, { hello: "world" }),
    );
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(req());

    expect(result).toEqual({ ok: true, payload: { hello: "world" } });
  });

  it("204 (empty body) succeeds with a null payload", async () => {
    const { fetch } = createFakeFetch(
      () => new Response(null, { status: 204 }),
    );
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(req());

    expect(result).toEqual({ ok: true, payload: null });
  });

  it("a non-2xx status with a parseable JSON body reports HTTP_STATUS_FAILED and carries the body as payload", async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse(500, { detail: "server exploded" }),
    );
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(
      req({ method: "POST", json: { x: 1 } }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "HTTP_STATUS_FAILED",
        message: expect.any(String),
        retryable: false,
      },
      payload: { detail: "server exploded" },
    });
  });

  it("a non-2xx status with an unparseable body still reports the real status, not masked as a parse failure", async () => {
    const { fetch } = createFakeFetch(
      () =>
        new Response("{not valid json", {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    );
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(req());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("HTTP_STATUS_FAILED");
    expect(result.error.message).toContain("502");
  });

  it("an idempotent method's 503 is retryable; the same status on POST is not", async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse(503, { error: "unavailable" }),
    );
    const executor = createHttpJsonExecutor({ fetch });

    const getResult = await executor.execute(req({ method: "GET" }));
    const postResult = await executor.execute(
      req({ method: "POST", json: {} }),
    );

    expect(getResult.ok).toBe(false);
    if (getResult.ok) throw new Error("unreachable");
    expect(getResult.error.retryable).toBe(true);

    expect(postResult.ok).toBe(false);
    if (postResult.ok) throw new Error("unreachable");
    expect(postResult.error.retryable).toBe(false);
  });

  it("an ordinary 404 on POST is not retryable", async () => {
    const { fetch } = createFakeFetch(() => jsonResponse(404, {}));
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(req({ method: "POST", json: {} }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.retryable).toBe(false);
  });

  it("a network failure unrelated to any signal reports HTTP_NETWORK_FAILED", async () => {
    const { fetch } = createFakeFetch(() => {
      throw new Error("DNS lookup failed");
    });
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(req());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTTP_NETWORK_FAILED" },
    });
  });

  it("GET with a json body is rejected before fetch is ever called", async () => {
    const { fetch, fetchFn } = createFakeFetch(() => jsonResponse(200, {}));
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(
      req({ method: "GET", json: { x: 1 } }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTTP_REQUEST_INVALID" },
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("a non-http(s) URL scheme is rejected before fetch is ever called", async () => {
    const { fetch, fetchFn } = createFakeFetch(() => jsonResponse(200, {}));
    const executor = createHttpJsonExecutor({ fetch });

    const result = await executor.execute(req({ url: "file:///etc/passwd" }));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTTP_REQUEST_INVALID" },
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("an abort during the request propagates as a rejection, not misclassified as HTTP_NETWORK_FAILED", async () => {
    // Mirrors real fetch: reject when the passed signal fires.
    const fetchFn = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            {
              once: true,
            },
          );
        }),
    );
    const executor = createHttpJsonExecutor({
      fetch: fetchFn as unknown as typeof fetch,
    });
    const controller = new AbortController();

    const resultPromise = executor.execute(req(), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalled());
    controller.abort();

    await expect(resultPromise).rejects.toThrow();
  });

  it("json !== undefined drives serialization, not truthiness -- false/0/null bodies are actually sent", async () => {
    let capturedBody: string | undefined;
    const { fetch } = createFakeFetch((_url, init) => {
      capturedBody = init?.body as string | undefined;
      return jsonResponse(200, null);
    });
    const executor = createHttpJsonExecutor({ fetch });

    await executor.execute(req({ method: "POST", json: false }));

    expect(capturedBody).toBe("false");
  });

  it("passes headers through verbatim -- header defaulting is materialize-http-json-request's job, not the executor's", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const { fetch } = createFakeFetch((_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return jsonResponse(200, null);
    });
    const executor = createHttpJsonExecutor({ fetch });

    await executor.execute(req({ headers: { "X-Custom": "yes" } }));

    expect(capturedHeaders).toEqual({ "X-Custom": "yes" });
  });
});
