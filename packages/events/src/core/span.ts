import { createHash } from "crypto";
import type { JobScope, StepScope } from "@lcase/types";

// Unit-separator control character (0x1F), not a plain string join:
// identity-key parts (ids) could in principle contain other characters but
// realistically never a control character -- avoids ambiguous concatenation
// (e.g. "run-1"+"step-a" vs "run-1s"+"tep-a") colliding on the same hash input.
// This, not hash width, is the one real collision risk worth guarding against.
const SEP = String.fromCharCode(31);

/**
 * Deterministic W3C-shaped (16 hex char) span id from an ordered identity key.
 *
 * Birthday-bound collision risk at this width requires billions of spans in
 * play, far beyond this system's realistic scale.
 */
export function deriveSpanId(domain: string, ...identityKey: string[]): string {
  const material = [domain, ...identityKey].join(SEP);
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

/**
 * These are the config pieces that go into making a span id for a specific scope.
 * Scope itself is a consequence of an event's domain (domain.entity.action) --
 * each "domain" has a specific "scope" of required header fields in addition to
 * those found on all CloudEvent envelopes.
 */
export type SpanIdentityConfig<S> = {
  /**
   * Mixed into the hash so e.g. step/job sharing an identity key never collide --
   * this is the event's `domain` (see comment immediately above)
   */
  domain: string;
  identityKey: (scope: S) => readonly string[];
  /** Parent span found by reference, no coordinator/store needed. */
  parent?: SpanIdentityConfig<S>;
};

export const stepSpanConfig: SpanIdentityConfig<StepScope> = {
  domain: "step",
  // Full identity, not bare stepid -- a step reused under a different run
  // gets its own new span, since the same step definition recurs across runs.
  identityKey: (s) => [s.runid, s.stepid],
  parent: { domain: "run", identityKey: (s) => [s.runid] },
};

// `unknown`, not `any`:
// `unknown` keeps the one necessary cast confined to deriveSpanFor's read site
// below instead of letting `any` spread.
// A job's parent is the step that submitted it. `parent.identityKey` derives
// exactly what stepSpanConfig derives for the same scope, so a job event's
// parentspanid *is* the step event's spanid -- the linkage holds by matching
// derivation, with no coordinator or span store.
export const jobSpanConfig: SpanIdentityConfig<JobScope> = {
  domain: "job",
  // jobid included: a step may submit more than one job over its life (retry,
  // fan-out), and each submission is its own span under the step.
  identityKey: (s) => [s.runid, s.stepid, s.jobid],
  parent: { domain: "step", identityKey: (s) => [s.runid, s.stepid] },
};

export const spanConfigByDomain: Partial<
  Record<string, SpanIdentityConfig<unknown>>
> = {
  // Cast needed here, not just at the read site:
  // function parameters are contravariant, so SpanIdentityConfig<StepScope>
  // genuinely isn't assignable to SpanIdentityConfig<unknown>
  // (a function expecting the narrower StepScope can't safely be called with an
  // arbitrary unknown value) -- correct by construction since this map is only
  // ever populated with a domain's own config under its own key, same reasoning
  // as deriveSpanFor's cast below.
  step: stepSpanConfig as SpanIdentityConfig<unknown>,
  job: jobSpanConfig as SpanIdentityConfig<unknown>,
};

/**
 * Looks up the span config for `domain` and derives this entity's span id, plus
 * its parent's, by reference -- no stack, no coordinator. Domains with no registered
 * config (everything but `step`, for now) return undefined; callers fall back to
 * `generateRandomSpanId()`.
 */
export function deriveSpanFor(
  domain: string,
  scope: unknown,
): { spanId: string; parentSpanId?: string } | undefined {
  const config = spanConfigByDomain[domain];
  if (!config) return undefined;

  // `SpanIdentityConfig<S>.identityKey` is generic over `S`, but this map is keyed
  // by a runtime `domain: string` -- TS has no way to correlate "this string is
  // 'step'" with "therefore S is StepScope"; that link only holds by construction (we
  // only ever register `step`'s identity config under the "step" key), and this function is
  // only ever reached from buildEvent(), where the real T (event type) was already known.
  const identityKey = config.identityKey as (
    scope: unknown,
  ) => readonly string[];
  const spanId = deriveSpanId(config.domain, ...identityKey(scope));

  const parent = config.parent;
  const parentSpanId = parent
    ? deriveSpanId(
        parent.domain,
        ...(parent.identityKey as (scope: unknown) => readonly string[])(scope),
      )
    : undefined;

  return { spanId, ...(parentSpanId ? { parentSpanId } : {}) };
}
