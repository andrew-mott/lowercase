import { describe, expect, it } from "vitest";
import { InMemoryStreamCore } from "../../src/stream/internal/inmemory.stream-core.js";
import type { InputChunk } from "@lcase/ports";

describe("in-memory stream core", () => {
  it("delivers chunks in order sent", async () => {
    const stream = new InMemoryStreamCore("new-id");
    const chunkOne: InputChunk = {
      type: "data",
      payload: { text: "one" },
    };
    const chunkTwo: InputChunk = {
      type: "data",
      payload: { text: "two" },
    };
    const chunkThree: InputChunk = {
      type: "data",
      payload: { text: "three" },
    };
    const iterator = stream.subscribe();

    await stream.send(chunkOne);
    await stream.send(chunkTwo);
    await stream.send(chunkThree);

    const first = await iterator.next();
    expect(first.value).toMatchObject(chunkOne);
    const second = await iterator.next();
    expect(second.value).toMatchObject(chunkTwo);
    const three = await iterator.next();
    expect(three.value).toMatchObject(chunkThree);
    await stream.end();
    const { done } = await iterator.next();
    expect(done).toBe(true);
  });

  it("stream status changes correctly", async () => {
    const stream = new InMemoryStreamCore("new-id");
    const chunk: InputChunk = {
      type: "data",
      payload: { text: "chunk" },
    };
    expect(stream.status()).toBe("idle");
    const iterator = stream.subscribe();
    expect(stream.status()).toBe("open");
    await stream.send(chunk);
    expect(stream.status()).toBe("active");
    await iterator.next();
    await stream.end();
    expect(stream.status()).toBe("ended");
    await stream.close();
    expect(stream.status()).toBe("closed");
  });

  it("provides backpressure and deferred delivery", async () => {
    const stream = new InMemoryStreamCore("new-id");
    const iterator = stream.subscribe();
    const chunk: InputChunk = {
      type: "data",
      payload: { i: 1 },
    };

    const pending = iterator.next();
    await stream.send(chunk);

    const { value } = await pending;
    expect(value).toMatchObject(chunk);
  });
  it("resolves iterators as done after close() and throws on future sends()", async () => {
    const stream = new InMemoryStreamCore("new-id");
    const chunk: InputChunk = {
      type: "data",
      payload: { id: 100 },
    };
    await stream.send(chunk);
    const iterator = await stream.subscribe();
    await stream.close();

    const object = await iterator.next();
    expect(object.done).toBe(true);
    expect(object.value).toBe(undefined);

    await expect(stream.send(chunk)).rejects.toThrowError("stream is closed");
  });

  it("drains and stops iterator cleanly after end()", async () => {
    const stream = new InMemoryStreamCore("new-id");
    const chunk: InputChunk = {
      type: "data",
      payload: { i: 1 },
    };
    const iterator = stream.subscribe();
    await stream.send(chunk);
    await stream.end();
    const drain = await iterator.next();
    expect(drain.value).toMatchObject(chunk);
    expect(drain.done).toBe(false);
    const last = await iterator.next();
    expect(last.done).toBe(true);
  });
});
