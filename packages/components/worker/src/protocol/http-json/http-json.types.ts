import type { JsonValue } from "@lcase/types";
import type { HttpJsonMethod } from "../../job.contracts.js";

// A resolved binary: a stored artifact's actual bytes and content type, no
// longer a `{{...}}` placeholder. Shared between a top-level `artifact` body
// and a multipart file part -- `filename` is only meaningful for the latter.
export type ResolvedHttpBinary = {
  contentType: string;
  bytes: Uint8Array;
  filename?: string;
};

// `kind` (not `type`), matching ProtocolRequest's own convention of avoiding
// flow/Message vocabulary here. `json` is what httpjson's own body normalizes
// into; `artifact`/`multipart` are genuinely new, for the `http` step.
export type ResolvedHttpBody =
  | { kind: "json"; value: JsonValue }
  | { kind: "artifact"; value: ResolvedHttpBinary }
  | {
      kind: "multipart";
      parts: Record<string, string | ResolvedHttpBinary>;
    };

// Fully hydrated, ready to send -- no ref placeholders remain. `headers` is
// always present (materialization bakes in defaults), unlike the template's
// optional `headers?`. The executor never sets or infers a header from
// `body` itself -- Content-Type (including "taken from the artifact's own
// metadata") is the materializer's responsibility, baked into `headers`
// before a request reaches here.
export type ResolvedHttpJsonRequest = {
  url: string;
  method: HttpJsonMethod;
  headers: Record<string, string>;
  body?: ResolvedHttpBody;
};

// Deliberately narrower than a raw fetch Response -- `ok`/`redirected`/
// `statusText`/final `url`/every header are not durable workflow output.
// `contentType` is captured for a future caller to decide what to do with
// (see docs/initiatives/voice-pipeline/arcs/worker-http-executor.md, Change
// C7) -- `body` itself is still parsed as JSON-or-text only, unchanged.
export type HttpJsonResponse = {
  status: number;
  body: JsonValue;
  contentType?: string;
};

export type HttpJsonFailure =
  | { kind: "invalid-request"; message: string }
  | { kind: "network"; message: string }
  | { kind: "http-status"; status: number; message: string }
  | { kind: "invalid-response"; status: number; message: string };

export type HttpJsonResult =
  | { ok: true; response: HttpJsonResponse }
  | { ok: false; failure: HttpJsonFailure; response?: HttpJsonResponse };
