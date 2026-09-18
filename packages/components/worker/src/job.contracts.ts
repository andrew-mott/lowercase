import type { ExportRef, JsonValue, Ref } from "@lcase/types";

// Minimal, deliberately provisional -- the doc's own "Open Questions That Do
// Not Block Phase 1" leaves the final artifact/export reference shape open.
export type ArtifactRef = {
  hash: string;
};

export type HttpJsonMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

// The template shape -- ref placeholders (`{{...}}`) may still be present in
// `url`/`headers`/`body`. Deliberately not `StepHttpJson` itself: that type is
// flow-authoring-shaped (carries `on`, `exports`, routing concerns) and must
// never reach a ProtocolExecutor. `kind` (not `type`) deliberately avoids flow
// vocabulary: `type` names a step in a flow definition and an event type on a
// Message, and this is neither.
export type ProtocolRequest = {
  kind: "httpjson";
  url: string;
  method?: HttpJsonMethod;
  headers?: Record<string, string>;
  body?: JsonValue;
};

// What JobRunner executes: the work itself, with no job identity, scope,
// trace, or source. Splitting this from JobRunContext is what stops the old
// command shape from becoming JobRunner's permanent contract -- see
// docs/initiatives/swappable-infrastructure/research/worker-protocol-boundary.md.
export type HttpJsonWork = {
  readonly protocol: ProtocolRequest;
  readonly refs: Ref[];
  // `exportRefs` (not `exports`) deliberately: these are ExportRef
  // declarations of what to extract, and the submitted schema already calls
  // them that. `exports` elsewhere in this package means produced
  // ArtifactRefs -- see StoredExecutionOutputs.
  readonly exportRefs?: Record<string, ExportRef>;
};

// Per-invocation mechanics, separate from the work. `permitRequestId` is a
// diagnostic label only: the permit adapter interpolates it into its
// cancellation error and keys release off its own generated grantId. It is
// not execution-attempt identity, and must not be treated as one.
export type JobRunContext = {
  readonly permitRequestId: string;
  readonly signal?: AbortSignal;
};

export type JobExecutionErrorCode =
  | "CANCELLED"
  | "TIMEOUT"
  | "INPUT_RESOLUTION_FAILED"
  | "HTTP_REQUEST_INVALID"
  | "HTTP_NETWORK_FAILED"
  | "HTTP_STATUS_FAILED"
  | "HTTP_RESPONSE_INVALID"
  | "OUTPUT_STORE_FAILED"
  | "EXPORT_RESOLUTION_FAILED"
  | "EXPORT_VALIDATION_FAILED"
  | "EXPORT_STORE_FAILED"
  | "RESOURCE_KEY_RESOLUTION_FAILED";

export type JobExecutionError = {
  code: JobExecutionErrorCode;
  message: string;
  retryable: boolean;
};

// Worker's own vocabulary for how one job ended, deliberately carrying no
// identity: the submission is the only origin, so Worker already holds the ids
// and a copy here would have nothing to be a copy of. That absence is what
// lets terminal construction take (submission, result) and have exactly one
// source for each half.
//
// Not a component boundary -- the boundary is the Message -- so this must not
// grow into a second inter-component envelope.
export type JobResult =
  | {
      status: "completed";
      output: ArtifactRef;
      exports?: Record<string, ArtifactRef>;
    }
  | {
      status: "failed";
      error: JobExecutionError;
      output?: ArtifactRef;
    };
