import { describe, expect, it } from "vitest";
import {
  computeReplayCutoff,
  hasNewEventInRange,
  computeTickOutcome,
} from "@/components/workbench/shared/events/use-replay-clock";

// This app has no jsdom/@testing-library/react-test-renderer set up
// anywhere, so useReplayClock's actual effect-wiring (the thin rAF-loop
// shell) isn't exercised by a renderer here -- same treatment
// use-step-run-info.ts's own thin hook wrapper already gets in this
// codebase (only its pure deriveStepRunInfo is unit tested). Every real
// decision the hook makes lives in the three pure functions below, tested
// exhaustively with plain numbers, no timers.

describe("computeReplayCutoff", () => {
  it("advances linearly with elapsed wall-clock time at 1x", () => {
    const anchor = { cutoff: 1000, wallClock: 5000 };
    expect(computeReplayCutoff(anchor, 6000, 1)).toBe(2000);
  });

  it("scales elapsed time by speed", () => {
    const anchor = { cutoff: 1000, wallClock: 5000 };
    expect(computeReplayCutoff(anchor, 6000, 2)).toBe(3000);
    expect(computeReplayCutoff(anchor, 6000, 0.5)).toBe(1500);
  });

  it("returns exactly the anchor cutoff at zero elapsed time", () => {
    const anchor = { cutoff: 1000, wallClock: 5000 };
    expect(computeReplayCutoff(anchor, 5000, 2)).toBe(1000);
  });
});

describe("hasNewEventInRange", () => {
  const eventTimes = [100, 200, 300];

  it("is true when an event falls in (lastEmitted, next]", () => {
    expect(hasNewEventInRange(eventTimes, 100, 200)).toBe(true);
  });

  it("is true at the exact upper bound (inclusive)", () => {
    expect(hasNewEventInRange(eventTimes, 199, 200)).toBe(true);
  });

  it("is false at the exact lower bound (exclusive)", () => {
    expect(hasNewEventInRange(eventTimes, 200, 200)).toBe(false);
  });

  it("is false when no event falls in the range", () => {
    expect(hasNewEventInRange(eventTimes, 210, 290)).toBe(false);
  });

  it("is false for an empty eventTimes array", () => {
    expect(hasNewEventInRange([], 0, 1000)).toBe(false);
  });
});

describe("computeTickOutcome", () => {
  const eventTimes = [1000, 1500, 2000];

  it("skips when eventTimes is empty (nothing to bound against)", () => {
    const anchor = { cutoff: 0, wallClock: 0 };
    expect(computeTickOutcome(anchor, 1000, 1, [], 0)).toEqual({
      kind: "skip",
    });
  });

  it("ticks when the computed cutoff crosses a new event", () => {
    // anchor at t=0 with cutoff=1000; 400ms elapsed at 1x -> next=1400,
    // crossing the 1000 event relative to lastEmitted=900
    const anchor = { cutoff: 1000, wallClock: 0 };
    expect(computeTickOutcome(anchor, 400, 1, eventTimes, 900)).toEqual({
      kind: "tick",
      cutoffTime: 1400,
    });
  });

  it("skips when the computed cutoff hasn't crossed any new event", () => {
    // next=1400, but lastEmitted is already 1400 -- nothing new
    const anchor = { cutoff: 1000, wallClock: 0 };
    expect(computeTickOutcome(anchor, 400, 1, eventTimes, 1400)).toEqual({
      kind: "skip",
    });
  });

  it("scales by speed, changing whether a tick is produced", () => {
    // same anchor/elapsed as above, but at 0.5x: next=1200, still crosses
    // the 1000 event relative to lastEmitted=900
    const anchor = { cutoff: 1000, wallClock: 0 };
    expect(computeTickOutcome(anchor, 400, 0.5, eventTimes, 900)).toEqual({
      kind: "tick",
      cutoffTime: 1200,
    });
  });

  it("reports finished once the computed cutoff reaches the last event's time", () => {
    const anchor = { cutoff: 1000, wallClock: 0 };
    // next = 1000 + 1000*1 = 2000, exactly the last event time
    expect(computeTickOutcome(anchor, 1000, 1, eventTimes, 1900)).toEqual({
      kind: "finished",
    });
  });

  it("reports finished once the computed cutoff passes the last event's time", () => {
    const anchor = { cutoff: 1000, wallClock: 0 };
    expect(computeTickOutcome(anchor, 5000, 1, eventTimes, 1900)).toEqual({
      kind: "finished",
    });
  });

  it("re-anchoring at a new speed doesn't retroactively reinterpret already-elapsed time", () => {
    // Simulates a speed change mid-playback: the caller re-anchors
    // (cutoff=1200, wallClock=<now>) rather than keeping the old anchor and
    // just swapping speed -- computeTickOutcome only ever sees the fresh
    // anchor, so there's no discontinuity to compute around here at all;
    // this documents that the re-anchoring responsibility lives in the
    // hook's effect (keyed on [status, speed]), not in this pure function.
    const freshAnchor = { cutoff: 1200, wallClock: 1000 };
    expect(computeTickOutcome(freshAnchor, 1200, 2, eventTimes, 1200)).toEqual({
      kind: "tick",
      cutoffTime: 1600,
    });
  });
});
