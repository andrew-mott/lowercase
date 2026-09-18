import { describe, it, expect, vi, afterEach } from "vitest";
import { StepEmitter } from "../src/emitters/step.emitter.js";
import type { EventBusPort } from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";

describe("[step-emitter]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces a valid event for a given context", () => {
    const publish = vi.fn().mockResolvedValue(null);
    const bus = {
      publish,
    } as unknown as EventBusPort;

    const testTime = "test-time";
    const testId = "test-id";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      testId as ReturnType<typeof crypto.randomUUID>,
    );
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(testTime);

    const event: AnyEvent<"step.started"> = {
      spanid: "test-spanid",
      traceid: "test-traceid",
      traceparent: "test-traceparent",
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      runid: "test-runid",
      stepid: "test-stepid",
      steptype: "test-steptype",
      source: "test-source",
      domain: "step",
      action: "started",
      data: {
        status: "started",
        step: {
          id: testId,
          name: "test-name",
          type: "test-steptype",
        },
      },
      specversion: "1.0",
      type: "step.started",
      id: testId,
      time: testTime,
    };
    const emitter = new StepEmitter(bus, {
      spanId: event.spanid,
      traceId: event.traceid,
      traceParent: event.traceparent,
      parentSpanId: event.parentspanid,
      flowid: event.flowid,
      flowversionid: event.flowversionid,
      runid: event.runid,
      stepid: event.stepid,
      source: event.source,
      steptype: event.steptype,
    });

    emitter.emit("step.started", {
      status: "started",
      step: {
        id: testId,
        name: "test-name",
        type: "test-steptype",
      },
    });

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith("step.started", event);
  });
});
