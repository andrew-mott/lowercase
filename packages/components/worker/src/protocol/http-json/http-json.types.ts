import type { JsonValue } from "@lcase/types";
import type { HttpJsonMethod } from "../../job.contracts.js";

// Fully hydrated, ready to send -- no ref placeholders remain. `headers` is
// always present (materialization bakes in defaults), unlike the template's
// optional `headers?`.
export type ResolvedHttpJsonRequest = {
  url: string;
  method: HttpJsonMethod;
  headers: Record<string, string>;
  json?: JsonValue;
};

// Deliberately narrower than a raw fetch Response -- `ok`/`redirected`/
// `statusText`/final `url`/every header are not durable workflow output.
export type HttpJsonResponse = {
  status: number;
  body: JsonValue;
};

export type HttpJsonFailure =
  | { kind: "invalid-request"; message: string }
  | { kind: "network"; message: string }
  | { kind: "http-status"; status: number; message: string }
  | { kind: "invalid-response"; status: number; message: string };

export type HttpJsonResult =
  | { ok: true; response: HttpJsonResponse }
  | { ok: false; failure: HttpJsonFailure; response?: HttpJsonResponse };
