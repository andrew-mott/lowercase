import type { JsonValue } from "@lcase/types";
import type { JobExecutionError } from "../../job.contracts.js";
import type {
  ProtocolExecutor,
  ProtocolResult,
} from "../protocol-executor.types.js";
import type {
  HttpJsonFailure,
  HttpJsonResponse,
  HttpJsonResult,
  ResolvedHttpBinary,
  ResolvedHttpJsonRequest,
} from "./http-json.types.js";

export type HttpJsonExecutorDeps = {
  // Injected as a plain function dependency for deterministic tests without
  // real network calls.
  fetch: typeof fetch;
};

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

// "safe for the system to execute the entire job again automatically" --
// not "this might be transient". A timed-out/failed POST is never retryable:
// the external side effect may have already happened.
function toJobExecutionError(
  failure: HttpJsonFailure,
  method: string,
): JobExecutionError {
  const idempotent = IDEMPOTENT_METHODS.has(method);
  switch (failure.kind) {
    case "invalid-request":
      return {
        code: "HTTP_REQUEST_INVALID",
        message: failure.message,
        retryable: false,
      };
    case "network":
      return {
        code: "HTTP_NETWORK_FAILED",
        message: failure.message,
        retryable: idempotent,
      };
    case "http-status":
      return {
        code: "HTTP_STATUS_FAILED",
        message: failure.message,
        retryable: idempotent && isRetryableStatus(failure.status),
      };
    case "invalid-response":
      return {
        code: "HTTP_RESPONSE_INVALID",
        message: failure.message,
        retryable: false,
      };
  }
}

function toBlob(binary: ResolvedHttpBinary): Blob {
  // Buffer.from, not the Uint8Array directly -- TS pins BlobPart/BodyInit to
  // Uint8Array<ArrayBuffer>, and a Uint8Array read back from storage is
  // typed Uint8Array<ArrayBufferLike> (could in principle back onto a
  // SharedArrayBuffer), so it isn't structurally assignable as-is.
  return new Blob([Buffer.from(binary.bytes)], { type: binary.contentType });
}

// The executor never sets or infers a header from `body` -- Content-Type
// (including a multipart boundary, which fetch derives from a FormData body
// on its own) is either already in `request.headers` or left to fetch.
function toFetchBody(
  body: ResolvedHttpJsonRequest["body"],
): BodyInit | undefined {
  if (body === undefined) return undefined;
  switch (body.kind) {
    case "json":
      return JSON.stringify(body.value);
    case "artifact":
      return Buffer.from(body.value.bytes);
    case "multipart": {
      const formData = new FormData();
      for (const [key, part] of Object.entries(body.parts)) {
        if (typeof part === "string") {
          formData.append(key, part);
        } else {
          formData.append(key, toBlob(part), part.filename);
        }
      }
      return formData;
    }
  }
}

async function readResponseBody(response: Response): Promise<JsonValue> {
  const contentType = response.headers.get("content-type");
  if (response.status === 204 || response.status === 205) {
    return null;
  }
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as JsonValue;
  }
  const text = await response.text();
  return text.length > 0 ? text : null;
}

async function invoke(
  deps: HttpJsonExecutorDeps,
  request: ResolvedHttpJsonRequest,
  signal: AbortSignal | undefined,
): Promise<HttpJsonResult> {
  let response: Response;
  try {
    response = await deps.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      // `body !== undefined`, not truthiness -- a falsy JSON value (`false`,
      // `0`, `null`) is still a body to send.
      ...(request.body !== undefined
        ? { body: toFetchBody(request.body) }
        : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    // If the signal is what caused this, propagate rather than convert to a
    // normal result -- Worker classifies TIMEOUT/CANCELLED by catching a
    // *rejected* promise via combineForProtocolRun's recorded cause; folding
    // an abort-induced failure into a resolved {kind:"network"} result here
    // would silently defeat that classification entirely.
    if (signal?.aborted) throw err;
    return { ok: false, failure: { kind: "network", message: String(err) } };
  }

  // Status is checked before any body-parse attempt is made, so a parse
  // failure on a non-2xx response never masks the real HTTP status (a
  // confirmed bug in the old tool, which parsed first).
  const isSuccess = response.status >= 200 && response.status <= 299;

  let body: JsonValue;
  try {
    body = await readResponseBody(response);
  } catch (err) {
    if (!isSuccess) {
      return {
        ok: false,
        failure: {
          kind: "http-status",
          status: response.status,
          message: `HTTP ${response.status}; response body could not be parsed: ${String(err)}`,
        },
      };
    }
    return {
      ok: false,
      failure: {
        kind: "invalid-response",
        status: response.status,
        message: `Could not parse response body as JSON: ${String(err)}`,
      },
    };
  }

  const httpJsonResponse: HttpJsonResponse = {
    status: response.status,
    body,
    contentType: response.headers.get("content-type") ?? undefined,
  };
  if (!isSuccess) {
    return {
      ok: false,
      failure: {
        kind: "http-status",
        status: response.status,
        message: `HTTP ${response.status}`,
      },
      response: httpJsonResponse,
    };
  }
  return { ok: true, response: httpJsonResponse };
}

export function createHttpJsonExecutor(
  deps: HttpJsonExecutorDeps,
): ProtocolExecutor {
  return {
    async execute(request, options): Promise<ProtocolResult> {
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        request.body !== undefined
      ) {
        return {
          ok: false,
          error: {
            code: "HTTP_REQUEST_INVALID",
            message: `HTTP ${request.method} requests cannot have a body`,
            retryable: false,
          },
        };
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(request.url);
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "HTTP_REQUEST_INVALID",
            message: `Invalid URL "${request.url}": ${String(err)}`,
            retryable: false,
          },
        };
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return {
          ok: false,
          error: {
            code: "HTTP_REQUEST_INVALID",
            message: `Unsupported URL scheme "${parsedUrl.protocol}"`,
            retryable: false,
          },
        };
      }

      const result = await invoke(deps, request, options?.signal);
      if (result.ok) {
        return {
          ok: true,
          payload: result.response.body,
          contentType: result.response.contentType,
        };
      }
      return {
        ok: false,
        error: toJobExecutionError(result.failure, request.method),
        ...(result.response
          ? {
              payload: result.response.body,
              contentType: result.response.contentType,
            }
          : {}),
      };
    },
  };
}
