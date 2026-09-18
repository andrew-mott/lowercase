import { describe, expect, it } from "vitest";
import { buildEvent } from "@lcase/events";
import type { AnyEvent } from "@lcase/types";
import { snapshotMessage } from "../src/in-process/snapshot-message.js";

function completedEvent(): AnyEvent<"job.httpjson.completed"> {
  return buildEvent(
    "job.httpjson.completed",
    { status: "success", output: "hash-1", exportHashes: { a: "hash-2" } },
    {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid: "job-1",
      capid: "httpjson",
      toolid: "tool-1",
      source: "lowercase://worker/test",
    },
  );
}

describe("snapshotMessage", () => {
  it("returns an independent copy, not the same reference", () => {
    const message = completedEvent();
    const snapshot = snapshotMessage(message);

    expect(snapshot).not.toBe(message);
    expect(snapshot.data).not.toBe(message.data);
    expect(snapshot).toEqual(message);
  });

  it("freezes nested values, not just the envelope", () => {
    const snapshot = snapshotMessage(completedEvent());

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.data)).toBe(true);
    expect(Object.isFrozen(snapshot.data.exportHashes)).toBe(true);
  });

  it("leaves the caller's own object untouched", () => {
    const message = completedEvent();
    snapshotMessage(message);

    // The publisher keeps a mutable object; only delivered copies are frozen.
    expect(Object.isFrozen(message)).toBe(false);
    expect(Object.isFrozen(message.data)).toBe(false);
  });

  it("survives a cyclic value and freezes through it", () => {
    // buildEvent's schemas would not produce a cycle, but structuredClone
    // preserves one, so the freeze walk has to terminate on it -- that is the
    // whole reason deepFreeze carries a WeakSet.
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    const message = completedEvent();
    const withCycle = {
      ...message,
      data: { ...message.data, cyclic },
    } as unknown as AnyEvent<"job.httpjson.completed">;

    const snapshot = snapshotMessage(withCycle);
    const snapshotCycle = (
      snapshot.data as unknown as { cyclic: { self: unknown } }
    ).cyclic;

    expect(snapshotCycle).not.toBe(cyclic);
    expect(snapshotCycle.self).toBe(snapshotCycle);
    expect(Object.isFrozen(snapshotCycle)).toBe(true);
  });
});
