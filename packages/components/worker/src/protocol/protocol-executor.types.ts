import type { JsonValue } from "@lcase/types";
import type { JobExecutionError } from "../job.contracts.js";
import type { ResolvedHttpJsonRequest } from "./http-json/http-json.types.js";

// Grows with MCP in Phase 5.
export type ResolvedProtocolRequest = ResolvedHttpJsonRequest;

export type ProtocolResult =
  | { ok: true; payload: JsonValue }
  // `payload` here is a parseable failure response body -- carried so it can
  // become the failed JobResult's optional `output` (debugging data via an
  // artifact reference, never a raw response in the lifecycle event).
  | { ok: false; error: JobExecutionError; payload?: JsonValue };

// `execute` is the plainest verb for "run this request", and it is always
// called through a named receiver (`protocol.execute(...)`), so it reads
// unambiguously even though the word is common.
export interface ProtocolExecutor {
  execute(
    request: ResolvedProtocolRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProtocolResult>;
}
