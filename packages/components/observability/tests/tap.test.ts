import type { EventBusPort, EventSink } from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservabilityTap } from "../src/core/tap.js";

// Written out rather than built with buildEvent(): the tap treats every event
// as opaque and never reads a field, so a literal keeps @lcase/events off
// observability's dependency list for the sake of one fixture.
function makeEvent(): AnyEvent<"job.httpjson.completed"> {
  return {
    id: "test-id",
    source: "lowercase://worker",
    specversion: "1.0",
    time: "test-time",
    type: "job.httpjson.completed",
    domain: "job",
    action: "completed",
    entity: "httpjson",
    traceid: "test-traceid",
    spanid: "test-spanid",
    traceparent: "test-traceparent",
    flowid: "flow-1",
    flowversionid: "flowversion-1",
    runid: "run-1",
    stepid: "step-1",
    jobid: "job-1",
    capid: "httpjson",
    toolid: "httpjson",
    data: { status: "success", output: "output-hash" },
  };
}

function makeSink(id: string, handle?: EventSink["handle"]): EventSink {
  return {
    id,
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    handle: vi.fn(handle ?? (async () => {})),
  };
}

// A bus that records its subscription so a test can invoke the callback
// directly -- enough to prove the legacy route and the direct route land on
// the same loop, without an in-memory bus implementation.
function makeFakeBus() {
  let handler: ((e: AnyEvent) => Promise<void>) | undefined;
  const bus: EventBusPort = {
    publish: vi.fn(async () => {}),
    subscribe: vi.fn((_topic, h) => {
      handler = h;
      return () => undefined;
    }),
    close: vi.fn(async () => undefined),
  };
  return { bus, deliver: (e: AnyEvent) => handler!(e) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ObservabilityTap.ingest", () => {
  it("fans one event to every configured sink", async () => {
    const first = makeSink("first");
    const second = makeSink("second");
    const { bus } = makeFakeBus();
    const tap = new ObservabilityTap(bus, [first, second]);
    const event = makeEvent();

    await tap.ingest(event);

    expect(first.handle).toHaveBeenCalledWith(event);
    expect(second.handle).toHaveBeenCalledWith(event);
  });

  it("reports a failing sink and still runs the ones after it", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const failing = makeSink("failing", async () => {
      throw new Error("sink exploded");
    });
    const later = makeSink("later");
    const { bus } = makeFakeBus();
    const tap = new ObservabilityTap(bus, [failing, later]);

    await expect(tap.ingest(makeEvent())).resolves.toBeUndefined();

    expect(later.handle).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]![0]).toContain("failing");
  });

  it("picks up a sink attached after construction and drops a detached one", async () => {
    const attached = makeSink("attached");
    const detached = makeSink("detached");
    const { bus } = makeFakeBus();
    const tap = new ObservabilityTap(bus, [detached]);

    tap.attachSink(attached);
    tap.detachSink(detached);
    await tap.ingest(makeEvent());

    expect(attached.handle).toHaveBeenCalledTimes(1);
    expect(detached.handle).not.toHaveBeenCalled();
  });

  // The point of extracting the loop: the legacy bus route is now one caller
  // of ingest() rather than the only way in, so a Message subscription can
  // reach identical fan-out without a second copy of this logic.
  it("is what the legacy bus subscription delegates to", async () => {
    const sink = makeSink("sink");
    const { bus, deliver } = makeFakeBus();
    const tap = new ObservabilityTap(bus, [sink]);
    const event = makeEvent();

    tap.start();
    await deliver(event);

    expect(bus.subscribe).toHaveBeenCalledTimes(1);
    expect(sink.handle).toHaveBeenCalledWith(event);
  });
});
