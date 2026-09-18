import { describe, it, expect, beforeAll } from "vitest";
import { JsonlEventLog } from "../../src/event-store/jsonl.store.js";
import path from "path";
import { WriteStream } from "fs";
import fs from "fs";
import type { AnyEvent } from "@lcase/types";

const testRunId = "test-runid";
const relativePath = "./replay-test";
const absoluteDirPath = path.join(import.meta.dirname, relativePath);
const absoluteFilePath = path.join(
  import.meta.dirname,
  relativePath,
  testRunId + ".events.jsonl",
);
console.log(absoluteDirPath);
console.log(absoluteFilePath);
const deleteFile = (path: string) => {
  if (fs.existsSync(path)) fs.unlinkSync(path);
};
describe("jsonl store adapter", () => {
  beforeAll(() => {
    // add test dir before running if so the test doesn't
    if (!fs.existsSync(absoluteDirPath)) fs.mkdirSync(absoluteDirPath);
  });

  it("produces the expected output file path", () => {
    const store = new JsonlEventLog(absoluteDirPath);
    const filePath = store.getFilePath("12345-abc");
    console.log(filePath);

    const expectedPath = path.join(absoluteDirPath, "12345-abc.events.jsonl");
    console.log(expectedPath);
    expect(filePath).toBe(expectedPath);
  });

  it("getWriteStream() returns a write stream", () => {
    const store = new JsonlEventLog(absoluteDirPath);
    const stream = store.getWriteStream("12345");
    const fullPath = store.getFilePath("12345");
    expect(stream).toBeInstanceOf(WriteStream);
    stream.end();
    stream.on("finish", () => deleteFile(fullPath));
  });

  it("recordEvent() stores a jsonl event", async () => {
    const store = new JsonlEventLog(absoluteDirPath);
    const fakeEvent = {
      runid: testRunId,
    } as unknown as AnyEvent;
    const ok = await store.recordEvent(fakeEvent);
    const stream = store.getWriteStream(testRunId);
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", (err?: Error | null) =>
        err ? reject(err) : resolve(),
      );
    });

    const fileContents = fs.readFileSync(absoluteFilePath, {
      encoding: "utf8",
    });
    expect(fileContents).toStrictEqual(JSON.stringify(fakeEvent) + "\n");
    expect(JSON.parse(fileContents.trim())).toEqual(fakeEvent);
    deleteFile(absoluteFilePath);

    expect(ok).toBe(true);
  });
  it("iterateAllEvents() reads lines one at a time", async () => {
    const runId = "iterate-test";
    const store = new JsonlEventLog(absoluteDirPath);
    const fakeEvent = {
      runid: runId,
    } as unknown as AnyEvent;
    await store.recordEvent(fakeEvent);
    await store.recordEvent(fakeEvent);

    const stream = store.getWriteStream(runId);
    const fullPath = store.getFilePath(runId);
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", (err?: Error | null) =>
        err ? reject(err) : resolve(),
      );
    });

    const allEvents: AnyEvent[] = [];
    // console.log("about to iterate", store.iterateAllEvents);
    for await (const event of store.iterateAllEvents(runId)) {
      allEvents.push(event);
    }
    expect(allEvents).toStrictEqual([fakeEvent, fakeEvent]);
    expect(allEvents.length).toEqual(2);
    deleteFile(fullPath);
  });
});
