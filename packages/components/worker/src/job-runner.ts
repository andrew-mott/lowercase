import { resolveJsonPath } from "@lcase/json-ref-binder";
import type { ArtifactReadWritePort } from "@lcase/ports";
import type { Ref } from "@lcase/types";
import {
  storeExecutionOutputs,
  tryStoreOutput,
} from "./execution-output-storage.js";
import type { StoredExecutionOutputs } from "./job-result.factories.js";
import type {
  ArtifactRef,
  HttpJsonWork,
  JobExecutionError,
  JobRunContext,
} from "./job.contracts.js";
import type { ResourcePermitPort } from "./ports/outbound/resource-permit.port.js";
import { combineForProtocolRun } from "./protocol/combine-for-protocol-run.js";
import type { ResolvedHttpJsonRequest } from "./protocol/http-json/http-json.types.js";
import { materializeHttpJsonRequest } from "./protocol/http-json/materialize-http-json-request.js";
import type {
  ProtocolExecutor,
  ProtocolResult,
} from "./protocol/protocol-executor.types.js";
import {
  defaultResourceKeyResolver,
  type ResourceKeyResolver,
} from "./resource-key-resolver.js";

export type JobRunnerDeps = {
  permits: ResourcePermitPort;
  protocol: ProtocolExecutor;
  artifacts: ArtifactReadWritePort;
  resourceKeyResolver?: ResourceKeyResolver;
};

export type JobRunnerConfig = {
  protocolTimeoutMs: number;
};

// What running one job produced. Deliberately not a JobResult: JobRunner
// reports only the modelled outcome, and Worker turns that into both the
// recorded lifecycle fact and the returned result. Keeping those two
// concerns at the root is what stops JobRunner growing a second, competing
// account of how a job ended.
export type JobRunOutcome =
  | { kind: "completed"; outputs: StoredExecutionOutputs }
  | { kind: "failed"; error: JobExecutionError; output?: ArtifactRef }
  | { kind: "cancelled" };

type ProtocolRunOutcome =
  | { kind: "result"; result: ProtocolResult }
  | { kind: "cancelled" }
  | { kind: "timeout" };

type ResolveRefsOutcome =
  | { ok: true; resolved: Record<string, unknown> }
  | { ok: false; error: JobExecutionError };

type PrepareProtocolRunOutcome =
  | {
      ok: true;
      request: ResolvedHttpJsonRequest;
      resourceKey: string;
    }
  | { ok: false; error: JobExecutionError };

function nonRetryableError(
  code: JobExecutionError["code"],
  message: string,
): JobExecutionError {
  return { code, message, retryable: false };
}

// The mechanics of executing one already-accepted job: resolve refs,
// materialize the protocol request, run it under a resource permit, store the
// outputs. It does not gate concurrency, record lifecycle facts, or know how
// the job arrived -- Worker owns all three.
export class JobRunner {
  readonly #deps: JobRunnerDeps;
  readonly #config: JobRunnerConfig;
  readonly #resolveKey: ResourceKeyResolver;

  constructor(deps: JobRunnerDeps, config: JobRunnerConfig) {
    this.#deps = deps;
    this.#config = config;
    this.#resolveKey = deps.resourceKeyResolver ?? defaultResourceKeyResolver;
  }

  async run(
    work: HttpJsonWork,
    context: JobRunContext,
  ): Promise<JobRunOutcome> {
    const prepared = await this.#prepareProtocolRun(work);
    if (!prepared.ok) {
      return { kind: "failed", error: prepared.error };
    }

    const protocolRun = await this.#runProtocol(
      context,
      prepared.request,
      prepared.resourceKey,
    );

    if (protocolRun.kind === "cancelled") {
      return { kind: "cancelled" };
    }
    if (protocolRun.kind === "timeout") {
      return {
        kind: "failed",
        error: nonRetryableError(
          "TIMEOUT",
          "Protocol execution exceeded the configured timeout",
        ),
      };
    }

    const protocolResult = protocolRun.result;
    if (!protocolResult.ok) {
      // Best-effort: a secondary storage failure here must not mask the
      // primary, more important protocol error.
      const output =
        protocolResult.payload !== undefined
          ? await tryStoreOutput(this.#deps.artifacts, protocolResult.payload)
          : undefined;
      return { kind: "failed", error: protocolResult.error, output };
    }

    const stored = await storeExecutionOutputs(
      this.#deps.artifacts,
      protocolResult.payload,
      work.exportRefs,
    );
    if (!stored.ok) {
      return { kind: "failed", error: stored.error, output: stored.output };
    }

    return { kind: "completed", outputs: stored.outputs };
  }

  async #prepareProtocolRun(
    work: HttpJsonWork,
  ): Promise<PrepareProtocolRunOutcome> {
    const refsOutcome = await this.#resolveRefs(work.refs);
    if (!refsOutcome.ok) return refsOutcome;

    const materialized = materializeHttpJsonRequest(
      work.protocol,
      work.refs,
      refsOutcome.resolved,
    );
    if (!materialized.ok) {
      return {
        ok: false,
        error: nonRetryableError("HTTP_REQUEST_INVALID", materialized.message),
      };
    }

    // No hint argument: nothing in the system has ever produced a
    // ResourceHint, so every key derives from the request's own origin. A
    // named-credential hint needs a real producer before the parameter earns
    // its place back here.
    const keyResult = this.#resolveKey(materialized.request);
    if (!keyResult.ok) {
      return {
        ok: false,
        error: nonRetryableError(
          "RESOURCE_KEY_RESOLUTION_FAILED",
          keyResult.message,
        ),
      };
    }

    return {
      ok: true,
      request: materialized.request,
      resourceKey: keyResult.resourceKey,
    };
  }

  async #runProtocol(
    context: JobRunContext,
    request: ResolvedHttpJsonRequest,
    resourceKey: string,
  ): Promise<ProtocolRunOutcome> {
    const combined = combineForProtocolRun(
      context.signal,
      this.#config.protocolTimeoutMs,
    );
    try {
      return {
        kind: "result",
        result: await this.#runProtocolWithPermit(
          context,
          request,
          resourceKey,
          combined.signal,
        ),
      };
    } catch (err) {
      const cause = combined.cause();
      if (cause === "caller") return { kind: "cancelled" };
      if (cause === "timeout") return { kind: "timeout" };
      throw err;
    } finally {
      combined.dispose();
    }
  }

  async #runProtocolWithPermit(
    context: JobRunContext,
    request: ResolvedHttpJsonRequest,
    resourceKey: string,
    protocolSignal: AbortSignal,
  ): Promise<ProtocolResult> {
    const { permits, protocol } = this.#deps;
    const grant = await permits.acquire(
      { requestId: context.permitRequestId, resourceKey },
      { signal: context.signal },
    );

    try {
      return await protocol.execute(request, { signal: protocolSignal });
    } finally {
      await permits.release(grant.grantId);
    }
  }

  async #resolveRefs(refs: Ref[]): Promise<ResolveRefsOutcome> {
    const resolved: Record<string, unknown> = {};
    for (const ref of refs) {
      if (ref.hash === null) continue;
      const value = await this.#resolveOneRef(ref);
      if (value === undefined) {
        return {
          ok: false,
          error: {
            code: "INPUT_RESOLUTION_FAILED",
            message: `Could not resolve reference "${ref.string}"`,
            retryable: false,
          },
        };
      }
      resolved[ref.string] = value;
    }
    return { ok: true, resolved };
  }

  async #resolveOneRef(ref: Ref): Promise<unknown> {
    if (ref.hash === null) return undefined;
    const { artifacts } = this.#deps;

    // Only params/steps refs carry a declared type; anything else (and any
    // undeclared type) defaults to JSON, matching the old getJson() fallback.
    const contentType =
      (ref.scope === "params" ? ref.paramType : ref.exportType) ??
      "application/json";

    if (contentType === "application/json") {
      const result = await artifacts.load(ref.hash, "application/json");
      if (!result.ok) return undefined;
      return resolveJsonPath(ref.valuePath, result.value);
    }

    const result = await artifacts.load(ref.hash, contentType);
    return result.ok ? result.value : undefined;
  }
}
