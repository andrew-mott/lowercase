import { describe, it, expect, vi } from "vitest";
import { EmitterFactory } from "../src/emitter-factory.js";
import type { EventBusPort } from "@lcase/ports";

describe("emitter factory", () => {
  it("generates a valid trace id", async () => {
    const publish = vi.fn().mockResolvedValue(null);
    const bus = {
      publish,
    } as unknown as EventBusPort;

    const ef = new EmitterFactory(bus);
    const traceId = ef.generateTraceId();

    expect(/^[a-zA-Z0-9]{32}$/.test(traceId)).toBe(true);
  });
  it("generates a valid span id", async () => {
    const publish = vi.fn().mockResolvedValue(null);
    const bus = {
      publish,
    } as unknown as EventBusPort;

    const ef = new EmitterFactory(bus);
    const traceId = ef.generateSpanId();

    expect(/^[a-zA-Z0-9]{16}$/.test(traceId)).toBe(true);
  });

  it("generates a valid trace parent with correct flags", async () => {
    const publish = vi.fn().mockResolvedValue(null);
    const bus = {
      publish,
    } as unknown as EventBusPort;

    const ef = new EmitterFactory(bus);
    const traceId = ef.generateTraceId();
    const spanId = ef.generateSpanId();
    const traceParent = ef.makeTraceParent(traceId, spanId);

    expect(/^00-[a-zA-Z0-9]{32}-[a-zA-Z0-9]{16}-01$/.test(traceParent)).toBe(
      true,
    );
    const traceParentTwo = ef.makeTraceParent(traceId, spanId, false);
    expect(/^00-[a-zA-Z0-9]{32}-[a-zA-Z0-9]{16}-00$/.test(traceParentTwo)).toBe(
      true,
    );
  });
});
