import type { JsonValue } from "../../json-value.js";
import type { FlowOutputError } from "../../flow-analysis/types.js";

export type GetRunOutputsReq = { runId: string };

export type RunOutputEntry =
  | {
      ok: true;
      hash: string;
      contentType: string;
      // Unknown only when the artifact's metadata row is missing and the
      // value is JSON, whose stored byte length isn't recoverable from the
      // parsed value.
      size?: number;
      // Present only for small json and text content. Anything else is
      // fetched by hash.
      payload?: JsonValue;
    }
  | { ok: false; error: FlowOutputError["reason"] };

export type RunOutputs = Record<string, RunOutputEntry>;

export type GetRunOutputsRes =
  { ok: true; outputs: RunOutputs } | { ok: false; error: string };
