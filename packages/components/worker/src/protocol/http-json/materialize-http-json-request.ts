import { bindStepRefs } from "@lcase/json-ref-binder";
import type { JsonValue, Ref, StepHttpJson } from "@lcase/types";
import type { ProtocolRequest } from "../../job.contracts.js";
import type { ResolvedHttpJsonRequest } from "./http-json.types.js";

export type MaterializeHttpJsonRequestOutcome =
  | { ok: true; request: ResolvedHttpJsonRequest }
  | { ok: false; message: string };

// Builds a bare StepHttpJson (StepCapCommonFields/StepOnField are both fully
// optional, so this satisfies the type with no cast), binds refs into it via
// the already-pure, already-reusable bindStepRefs -- no custom
// interpolation logic here -- then projects the bound result into the
// resolved, wire-ready shape.
export function materializeHttpJsonRequest(
  protocol: ProtocolRequest,
  refs: Ref[],
  resolved: Record<string, unknown>,
): MaterializeHttpJsonRequestOutcome {
  const template: StepHttpJson = {
    type: "httpjson",
    url: protocol.url,
    method: protocol.method,
    headers: protocol.headers,
    body: protocol.body,
  };

  const bound = bindStepRefs(refs, resolved, template);

  const method = bound.method ?? "GET";
  if ((method === "GET" || method === "HEAD") && bound.body !== undefined) {
    return {
      ok: false,
      message: `HTTP ${method} requests cannot have a body`,
    };
  }

  const headers: Record<string, string> = { ...bound.headers };
  const hasJsonBody = bound.body !== undefined;
  if (!("Accept" in headers) && !("accept" in headers)) {
    headers["Accept"] = "application/json";
  }
  if (
    hasJsonBody &&
    !("Content-Type" in headers) &&
    !("content-type" in headers)
  ) {
    headers["Content-Type"] = "application/json";
  }

  try {
    // Validate the materialized URL -- only http:/https: allowed.
    const parsed = new URL(bound.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        message: `Unsupported URL scheme "${parsed.protocol}" for "${bound.url}"`,
      };
    }
  } catch (err) {
    return { ok: false, message: `Invalid URL "${bound.url}": ${String(err)}` };
  }

  return {
    ok: true,
    request: {
      url: bound.url,
      method,
      headers,
      // ShallowJsonValue -> JsonValue: correct by construction (a step's
      // body is only ever JSON.parse'd/authored JSON), but not structurally
      // assignable (ShallowJsonValue's array/object members are `unknown[]`/
      // `Record<string, unknown>`, not recursively typed).
      ...(hasJsonBody ? { json: bound.body as JsonValue } : {}),
    },
  };
}
