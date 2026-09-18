import { describe, expect, it } from "vitest";
import { InMemoryStreamRegistry } from "../../src/stream/inmemory.stream-registry.js";

describe("in-memory stream registry", () => {
  it("returns a stream with the id supplied", () => {
    const streamRegistry = new InMemoryStreamRegistry();
    const { id } = streamRegistry.createStream("new-id");
    expect(id).toBe("new-id");
  });
  it("returns and gets a producer", () => {
    const streamRegistry = new InMemoryStreamRegistry();
    const newId = "new-id";
    const { id, producer } = streamRegistry.createStream(newId);
    const p = streamRegistry.getProducer(newId);
    expect(producer).toBeDefined();
    expect(p).toBeDefined();
    expect(newId).toBe(id);
  });
  it("returns and gets consumer", () => {
    const streamRegistry = new InMemoryStreamRegistry();
    const newId = "new-id";
    const { id, producer } = streamRegistry.createStream(newId);
    const c = streamRegistry.getConsumer(newId);
    expect(producer).toBeDefined();
    expect(c).toBeDefined();
    expect(newId).toBe(id);
  });
  it("returns and gets a consumer", () => {
    const streamRegistry = new InMemoryStreamRegistry();
    const { producer } = streamRegistry.createStream("new-id");
    expect(producer).toBeDefined();
  });

  it("closes the stream for producer and consumer", () => {
    const streamRegistry = new InMemoryStreamRegistry();
    const { id, producer, consumer } = streamRegistry.createStream("new-id");
    expect(producer.status()).toBe("idle");
    expect(consumer.status()).toBe("idle");
    streamRegistry.closeStream(id);
    expect(producer.status()).toBe("closed");
    expect(consumer.status()).toBe("closed");
  });

  it("getProducer() and getConsumer() throw after stream is closed", async () => {
    const streamRegistry = new InMemoryStreamRegistry();
    const { id } = streamRegistry.createStream("new-id");
    expect(id).toBe("new-id");
    await streamRegistry.closeStream(id);

    expect(() => streamRegistry.getProducer(id)).toThrowError();
    expect(() => streamRegistry.getConsumer(id)).toThrowError();
  });
});
