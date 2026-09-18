import { describe, it, expect } from "vitest";
import { buildEvent, publishEvent, emit } from "../src/core/emit.js";
import { deriveSpanId } from "../src/core/span.js";
import { makeTraceParent } from "../src/core/trace.js";
import { createMockBus } from "./helpers/mock-bus.js";
import type { AnyEvent, StepCompletedData } from "@lcase/types";

const stepScope = {
  flowid: "flow-1",
  flowversionid: "flowversion-1",
  runid: "run-1",
  stepid: "step-a",
  steptype: "httpjson",
  source: "test",
} as const;

const completedData: StepCompletedData = {
  status: "success",
  step: { id: "step-a", name: "Test step", type: "httpjson" },
};

describe("emit()", () => {
  it("emits a new-trace event with a deterministically derived span/parent span", async () => {
    const { bus, publish } = createMockBus();

    const event = await emit(bus, "step.completed", completedData, stepScope);

    expect(event.spanid).toBe(deriveSpanId("step", "run-1", "step-a"));
    expect(event.parentspanid).toBe(deriveSpanId("run", "run-1"));
    expect(event.traceid).toMatch(/^[0-9a-f]{32}$/);
    expect(event.traceparent).toBe(
      makeTraceParent(event.traceid, event.spanid),
    );
    expect(event.data).toBe(completedData);
    expect(event.type).toBe("step.completed");
    expect(event.domain).toBe("step");
    expect(event.action).toBe("completed");

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith("step.completed", event);
  });

  it("derives trace/parent-span from an inbound event when fromEvent is given", async () => {
    const { bus } = createMockBus();
    const fromEvent = { traceid: "inbound-trace-id" } as AnyEvent;

    const event = await emit(bus, "step.completed", completedData, {
      ...stepScope,
      fromEvent,
    });

    expect(event.traceid).toBe("inbound-trace-id");
    expect(event.spanid).toBe(deriveSpanId("step", "run-1", "step-a"));
    expect(event.parentspanid).toBe(deriveSpanId("run", "run-1"));
  });

  it("starts a new span within a known trace when traceId is given", async () => {
    const { bus } = createMockBus();

    const event = await emit(bus, "step.completed", completedData, {
      ...stepScope,
      traceId: "known-trace-id",
    });

    expect(event.traceid).toBe("known-trace-id");
    expect(event.parentspanid).toBe(deriveSpanId("run", "run-1"));
  });

  it("does not publish when buildEvent is used alone, and publishes exactly once when publishEvent is then called", async () => {
    const { bus, publish } = createMockBus();

    const built = buildEvent("step.completed", completedData, stepScope);
    expect(publish).not.toHaveBeenCalled();

    const published = await publishEvent(bus, built);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith("step.completed", built);
    expect(published).toBe(built);
  });

  it("throws and never publishes when data fails schema validation", async () => {
    const { bus, publish } = createMockBus();
    const invalidData = { status: "success" } as unknown as StepCompletedData; // missing required `step`

    await expect(
      emit(bus, "step.completed", invalidData, stepScope),
    ).rejects.toThrow(/\[emit\] error parsing event; step\.completed/);
    expect(publish).not.toHaveBeenCalled();
  });
});
