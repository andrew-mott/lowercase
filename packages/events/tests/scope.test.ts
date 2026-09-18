import { describe, it, expect } from "vitest";
import { deriveTraceHeaderFields } from "../src/core/scope.js";
import { deriveSpanId } from "../src/core/span.js";
import { makeTraceParent } from "../src/core/trace.js";
import type { AnyEvent } from "@lcase/types";

const stepScope = {
  flowid: "flow-1",
  flowversionid: "flowversion-1",
  runid: "run-1",
  stepid: "step-a",
  steptype: "httpjson",
  source: "test",
} as const;

const jobScope = {
  flowid: "flow-1",
  flowversionid: "flowversion-1",
  runid: "run-1",
  stepid: "step-a",
  jobid: "job-1",
  capid: "mcp",
  toolid: "tool-1",
  source: "test",
} as const;

describe("deriveTraceHeaderFields()", () => {
  it("starts a fresh trace when neither fromEvent nor traceId is given", () => {
    const resolved = deriveTraceHeaderFields<"step.completed">(
      "step",
      stepScope,
    );
    expect(resolved.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("echoes an explicitly given traceId verbatim", () => {
    const resolved = deriveTraceHeaderFields<"step.completed">("step", {
      ...stepScope,
      traceId: "known-trace-id",
    });
    expect(resolved.traceId).toBe("known-trace-id");
  });

  it("copies traceId from a given fromEvent", () => {
    const fromEvent = { traceid: "inbound-trace-id" } as AnyEvent;
    const resolved = deriveTraceHeaderFields<"step.completed">("step", {
      ...stepScope,
      fromEvent,
    });
    expect(resolved.traceId).toBe("inbound-trace-id");
  });

  it("derives a step's spanId/parentSpanId regardless of which origin produced the trace", () => {
    const viaNewTrace = deriveTraceHeaderFields<"step.completed">(
      "step",
      stepScope,
    );
    const viaTraceId = deriveTraceHeaderFields<"step.completed">("step", {
      ...stepScope,
      traceId: "known-trace-id",
    });

    expect(viaNewTrace.spanId).toBe(deriveSpanId("step", "run-1", "step-a"));
    expect(viaTraceId.spanId).toBe(deriveSpanId("step", "run-1", "step-a"));
    expect(viaNewTrace.parentSpanId).toBe(deriveSpanId("run", "run-1"));
  });

  it("builds traceParent from the resolved traceId/spanId", () => {
    const resolved = deriveTraceHeaderFields<"step.completed">("step", {
      ...stepScope,
      traceId: "known-trace-id",
    });
    expect(resolved.traceParent).toBe(
      makeTraceParent(resolved.traceId, resolved.spanId),
    );
  });

  it("falls back to a random 16 hex char spanId for a domain with no registered span config", () => {
    // `run` rather than `job`: job now has a registered config.
    const resolved = deriveTraceHeaderFields<"run.completed">("run", {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      source: "lowercase://test",
    });
    expect(resolved.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(resolved.parentSpanId).toBeUndefined();
  });

  it("derives a deterministic job spanId parented on its step", () => {
    const resolved = deriveTraceHeaderFields<"job.mcp.queued">("job", jobScope);
    expect(resolved.spanId).toBe(
      deriveSpanId("job", jobScope.runid, jobScope.stepid, jobScope.jobid),
    );
    expect(resolved.parentSpanId).toBe(
      deriveSpanId("step", jobScope.runid, jobScope.stepid),
    );
  });
});
