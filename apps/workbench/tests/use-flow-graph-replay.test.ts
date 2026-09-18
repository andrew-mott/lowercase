import { describe, expect, it } from "vitest";
import type { AnyEvent } from "@lcase/types";
import type { ReplayState } from "@/redux/slices/flow-graph-panels-slice";
import {
  decideReplayToggle,
  filterEventsUpTo,
} from "@/components/workbench/shared/events/use-flow-graph-replay";

// This app has no jsdom/@testing-library/react-test-renderer set up
// anywhere, so useFlowGraphReplay itself (the Redux-wired hook) isn't
// independently unit-tested here -- same reasoning as
// use-replay-clock.test.ts. Both real decisions it makes beyond plain
// Redux dispatch plumbing are pure functions, tested directly below.

function makeEvent(time: string): AnyEvent {
  return {
    id: `evt-${time}`,
    source: "test",
    specversion: "1.0",
    time,
  } as unknown as AnyEvent;
}

describe("decideReplayToggle", () => {
  it("starts fresh from the given time when idle (replay is null)", () => {
    expect(decideReplayToggle(null, 1000)).toEqual({
      type: "start",
      startCutoffTime: 1000,
    });
  });

  it("pauses when currently playing", () => {
    const replay: ReplayState = { status: "playing", cutoffTime: 500 };
    expect(decideReplayToggle(replay, 1000)).toEqual({ type: "pause" });
  });

  it("resumes when currently paused", () => {
    const replay: ReplayState = { status: "paused", cutoffTime: 500 };
    expect(decideReplayToggle(replay, 1000)).toEqual({ type: "resume" });
  });

  it("always starts fresh from the given time, ignoring any prior cutoff, when idle", () => {
    // distinct from resume: idle has no prior replay state to resume from,
    // so a fresh start always uses the caller-supplied first-event time,
    // never something derived from a previous session
    expect(decideReplayToggle(null, 42)).toEqual({
      type: "start",
      startCutoffTime: 42,
    });
  });
});

describe("filterEventsUpTo", () => {
  const events = [makeEvent("2026-01-01T00:00:00.000Z")].concat([
    makeEvent("2026-01-01T00:00:01.000Z"),
    makeEvent("2026-01-01T00:00:02.000Z"),
  ]);
  const t0 = Date.parse("2026-01-01T00:00:00.000Z");
  const t1 = Date.parse("2026-01-01T00:00:01.000Z");

  it("returns the exact same array reference when cutoffTime is null (idle)", () => {
    expect(filterEventsUpTo(events, null)).toBe(events);
  });

  it("filters to events at or before the cutoff", () => {
    expect(filterEventsUpTo(events, t1)).toEqual([events[0], events[1]]);
  });

  it("returns an empty array when the cutoff is before every event", () => {
    expect(filterEventsUpTo(events, t0 - 1)).toEqual([]);
  });

  it("returns every event once the cutoff is at or past the last one", () => {
    expect(
      filterEventsUpTo(events, Date.parse("2026-01-01T00:00:02.000Z")),
    ).toEqual(events);
  });
});
