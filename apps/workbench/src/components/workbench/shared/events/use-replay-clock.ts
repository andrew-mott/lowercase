import { useEffect, useRef } from "react";

export type ReplayClockStatus = "idle" | "playing" | "paused";

type Anchor = { cutoff: number; wallClock: number };

// Pure -- no timers, no React. Given an anchor (cutoff + the wall-clock
// time it was set at) and how much wall-clock time has passed since,
// computes where the cutoff should be *right now*, scaled by speed.
// Recomputing from this formula every tick (rather than accumulating a
// delta onto the previous tick's value) is what makes the clock self-heal
// after any gap in tick frequency -- e.g. requestAnimationFrame throttling
// while the browser tab is backgrounded -- with no catch-up logic needed.
export function computeReplayCutoff(
  anchor: Anchor,
  now: number,
  speed: number,
): number {
  return anchor.cutoff + (now - anchor.wallClock) * speed;
}

// Whether advancing the cutoff to `next` reveals at least one event not
// already revealed as of `lastEmitted` -- used to skip a tick when nothing
// actually changed (0.5x speed, or a gap between events), rather than
// dispatching on every animation frame regardless of real progress.
export function hasNewEventInRange(
  eventTimes: number[],
  lastEmitted: number,
  next: number,
): boolean {
  return eventTimes.some((t) => t > lastEmitted && t <= next);
}

// tick is used in the event where we store state in redux (the cutoffTime)
// others skip that or mark the replay as finished.
export type TickOutcome =
  | { kind: "finished" }
  | { kind: "tick"; cutoffTime: number }
  | { kind: "skip" };

// The entire per-frame decision, pure and framework-free -- everything
// useReplayClock's rAF loop below needs to decide is captured here, so
// that decision is fully unit-testable with plain numbers, no timers, no
// DOM, no rendering. This app has no jsdom/@testing-library/react-test-
// renderer set up anywhere, so unlike a codebase with that infrastructure
// already in place, the *hook* itself (the thin effect-wiring shell below)
// isn't independently unit-tested -- same treatment use-step-run-info.ts's
// own thin useMemo wrapper around deriveStepRunInfo already gets in this
// codebase. Covered instead by the manual browser checklist.
export function computeTickOutcome(
  anchor: Anchor,
  now: number,
  speed: number,
  eventTimes: number[],
  lastEmitted: number,
): TickOutcome {
  const endTime = eventTimes.at(-1);
  if (endTime === undefined) return { kind: "skip" };
  const next = computeReplayCutoff(anchor, now, speed);
  if (next >= endTime) return { kind: "finished" };
  if (hasNewEventInRange(eventTimes, lastEmitted, next)) {
    return { kind: "tick", cutoffTime: next };
  }
  return { kind: "skip" };
}

type Params = {
  status: ReplayClockStatus;
  // Caller-owned source of truth (persisted); only read when status is
  // "playing" -- see the re-anchor effect below.
  cutoffTime: number;
  eventTimes: number[]; // sorted ascending, epoch ms
  speed: number;
  onTick: (cutoffTime: number) => void; // at most once/frame, skipped if nothing new crossed
  onFinished: () => void; // fires once, when cutoff reaches/passes the last event's time
};

// Generic playback clock -- no Redux, no dockview, no app-specific event
// shape, just "given timestamps and play/pause/speed, produce ticks."
// Formula-based (see computeReplayCutoff above). Driven by
// requestAnimationFrame -- a visual-sync primitive, the right tool for a
// loop that only needs to update once per repaint. Switching to
// setInterval wouldn't dodge background-tab throttling either (intervals
// get throttled too, often more aggressively) while losing that property.
export function useReplayClock({
  status,
  cutoffTime,
  eventTimes,
  speed,
  onTick,
  onFinished,
}: Params): void {
  const anchorRef = useRef<Anchor | null>(null);
  const lastEmittedRef = useRef(cutoffTime);
  const onTickRef = useRef(onTick);
  const onFinishedRef = useRef(onFinished);
  onTickRef.current = onTick;
  onFinishedRef.current = onFinished;

  // Re-anchors on every transition into "playing", AND on a speed change
  // while already playing -- re-anchoring only on the status transition
  // would let a speed change retroactively reinterpret already-elapsed
  // time under the new speed, producing a discontinuous jump instead of a
  // smooth rate change from that moment forward. Deliberately not keyed on
  // cutoffTime, which changes every tick -- keying on it would re-anchor
  // every frame and freeze the clock at an instantaneous rate.
  useEffect(() => {
    if (status === "playing") {
      anchorRef.current = { cutoff: cutoffTime, wallClock: Date.now() };
      lastEmittedRef.current = cutoffTime;
    } else {
      anchorRef.current = null;
    }
    // cutoffTime deliberately excluded -- see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, speed]);

  useEffect(() => {
    if (status !== "playing") return;
    const endTime = eventTimes.at(-1);
    if (endTime === undefined) return;

    let frame: number;
    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const outcome = computeTickOutcome(
        anchor,
        Date.now(),
        speed,
        eventTimes,
        lastEmittedRef.current,
      );
      if (outcome.kind === "finished") {
        onFinishedRef.current();
        return; // no reschedule -- the caller flips status away from "playing"
      }
      if (outcome.kind === "tick") {
        lastEmittedRef.current = outcome.cutoffTime;
        onTickRef.current(outcome.cutoffTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, speed, eventTimes]);
}
