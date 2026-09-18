import { describe, it, expect } from "vitest";
import { deriveSpanId, deriveSpanFor } from "../src/core/span.js";

describe("deriveSpanId() and deriveSpanFor()", () => {
  it("derives the same span id for the same identity key", () => {
    expect(deriveSpanId("step", "run-1", "step-a")).toBe(
      deriveSpanId("step", "run-1", "step-a"),
    );
  });

  it("derives a different span id for a different stepid", () => {
    expect(deriveSpanId("step", "run-1", "step-a")).not.toBe(
      deriveSpanId("step", "run-1", "step-b"),
    );
  });

  it("derives a different span id when the same step recurs under a different run (reuse case)", () => {
    expect(deriveSpanId("step", "run-1", "step-a")).not.toBe(
      deriveSpanId("step", "run-2", "step-a"),
    );
  });

  it("formats as a W3C-shaped 16 hex character span id", () => {
    expect(deriveSpanId("step", "run-1", "step-a")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("derives a step's parent span by reference to its run, keyed on runid alone", () => {
    const derived = deriveSpanFor("step", { runid: "run-1", stepid: "step-a" });
    expect(derived?.parentSpanId).toBe(deriveSpanId("run", "run-1"));
  });

  it("returns undefined for a domain with no registered span config", () => {
    // `run` rather than `job`: job now has a registered config, so it is no
    // longer an example of an unregistered domain.
    expect(deriveSpanFor("run", { runid: "run-1" })).toBeUndefined();
  });

  it("derives a job span whose parent is its step's span", () => {
    const scope = { runid: "run-1", stepid: "step-a", jobid: "job-1" };
    const derived = deriveSpanFor("job", scope);

    expect(derived?.spanId).toBe(
      deriveSpanId("job", "run-1", "step-a", "job-1"),
    );
    // The linkage that matters: a job's parentSpanId is exactly the spanId the
    // step's own config derives, so the two agree without a coordinator.
    expect(derived?.parentSpanId).toBe(deriveSpanId("step", "run-1", "step-a"));
    expect(derived?.parentSpanId).toBe(deriveSpanFor("step", scope)?.spanId);
  });

  it("gives two jobs under one step distinct spans sharing one parent", () => {
    const base = { runid: "run-1", stepid: "step-a" };
    const first = deriveSpanFor("job", { ...base, jobid: "job-1" });
    const second = deriveSpanFor("job", { ...base, jobid: "job-2" });

    expect(first?.spanId).not.toBe(second?.spanId);
    expect(first?.parentSpanId).toBe(second?.parentSpanId);
  });

  it("derives the same job span id on every call", () => {
    const scope = { runid: "run-1", stepid: "step-a", jobid: "job-1" };
    expect(deriveSpanFor("job", scope)).toEqual(deriveSpanFor("job", scope));
  });
});
