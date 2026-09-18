import { describe, it, expect, vi } from "vitest";
import { InMemoryEventBus } from "../../src/event-bus/inmemory.event-bus.js";

describe("[inmemory-event-bus]", () => {
  it("generates no patterns for a one element topic ", () => {
    const bus = new InMemoryEventBus();

    const patterns = bus.generatePatterns("job");
    expect(patterns).toBeDefined();
    expect(patterns?.length).toEqual(0);
  });
  it("generates two patterns for a valid two element topic ", () => {
    const bus = new InMemoryEventBus();

    const patterns = bus.generatePatterns("job.mcp");
    expect(patterns).toBeDefined();
    expect(patterns?.length).toEqual(2);
    expect(patterns?.[0]).toBe("job.*");
    expect(patterns?.[1]).toBe("*.mcp");
  });
  it("generates five patterns for a valid three element topic", () => {
    const bus = new InMemoryEventBus();

    const patterns = bus.generatePatterns("job.mcp.submitted");
    expect(patterns).toBeDefined();
    expect(patterns?.length).toEqual(5);
    expect(patterns?.[0]).toBe("job.*");
    expect(patterns?.[1]).toBe("*.submitted");
    expect(patterns?.[2]).toBe("job.mcp.*");
    expect(patterns?.[3]).toBe("*.mcp.submitted");
    expect(patterns?.[4]).toBe("job.*.submitted");
  });
  it("makes the correct topics for two part events", () => {
    const bus = new InMemoryEventBus();

    const patterns = bus.getTopics("job.submitted");
    expect(patterns).toBeDefined();
    expect(patterns?.length).toEqual(5);
    expect(patterns?.[0]).toBe("observability");
    expect(patterns?.[1]).toBe("*");
    expect(patterns?.[2]).toBe("job.submitted");
    expect(patterns?.[3]).toBe("job.*");
    expect(patterns?.[4]).toBe("*.submitted");
  });
  it("makes the correct topics for three part events", () => {
    const bus = new InMemoryEventBus();

    const patterns = bus.getTopics("job.mcp.submitted");
    expect(patterns).toBeDefined();
    expect(patterns?.length).toEqual(8);
    expect(patterns?.[0]).toBe("observability");
    expect(patterns?.[1]).toBe("*");
    expect(patterns?.[2]).toBe("job.mcp.submitted");
    expect(patterns?.[3]).toBe("job.*");
    expect(patterns?.[4]).toBe("*.submitted");
    expect(patterns?.[5]).toBe("job.mcp.*");
    expect(patterns?.[6]).toBe("*.mcp.submitted");
    expect(patterns?.[7]).toBe("job.*.submitted");
  });
  it("makes the correct topics for wildcard events", () => {
    const bus = new InMemoryEventBus();

    const patterns = bus.getTopics("*");
    expect(patterns).toBeDefined();
    expect(patterns?.length).toEqual(2);
    expect(patterns?.[0]).toBe("observability");
    expect(patterns?.[1]).toBe("*");
  });
  it("bypasses observability if options set internal to true", () => {
    const bus = new InMemoryEventBus();

    const patterns = bus.getTopics("*", { internal: true });
    expect(patterns).toBeDefined();
    expect(patterns?.length).toEqual(1);
    expect(patterns?.[0]).toBe("*");
  });

  it("calls generatPatterns once when getting topics for topics its already seen", () => {
    const bus = new InMemoryEventBus();

    vi.spyOn(bus, "generatePatterns").mockImplementation(() => {
      return ["test"];
    });

    bus.getTopics("job.submitted");
    bus.getTopics("job.submitted");
    expect(bus.generatePatterns).toHaveBeenCalledOnce();
  });
  it("calls generatPatterns again when getting topics for topics it has not seen", () => {
    const bus = new InMemoryEventBus();

    vi.spyOn(bus, "generatePatterns").mockImplementation(() => {
      return ["test"];
    });

    bus.getTopics("job.submitted");
    bus.getTopics("job.mcp.submitted");
    expect(bus.generatePatterns).toHaveBeenCalledTimes(2);
  });
});
