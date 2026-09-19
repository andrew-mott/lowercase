import type { JsonValue } from "@lcase/types";
import type { JobExecutionError } from "../job.contracts.js";
import type { ResolvedHttpJsonRequest } from "./http-json/http-json.types.js";

// Grows with MCP in Phase 5.
export type ResolvedProtocolRequest = ResolvedHttpJsonRequest;

export type ProtocolResult =
  // `contentType` is the response's real Content-Type header, captured for a
  // future caller (see worker-http-executor.md, Change C7) -- `payload` is
  // still always JSON-or-text, unchanged.
  | { ok: true; payload: JsonValue; contentType?: string }
  // `payload` here is a parseable failure response body -- carried so it can
  // become the failed JobResult's optional `output` (debugging data via an
  // artifact reference, never a raw response in the lifecycle event).
  | {
      ok: false;
      error: JobExecutionError;
      payload?: JsonValue;
      contentType?: string;
    };

// `execute` is the plainest verb for "run this request", and it is always
// called through a named receiver (`protocol.execute(...)`), so it reads
// unambiguously even though the word is common.
export interface ProtocolExecutor {
  execute(
    request: ResolvedProtocolRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProtocolResult>;
}
