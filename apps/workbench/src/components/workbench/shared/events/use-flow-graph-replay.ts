import { useMemo } from "react";
import type { AnyEvent } from "@lcase/types";
import { useAppDispatch, useAppSelector } from "@/redux/typed-hooks";
import {
  replayStarted,
  replayPaused,
  replayResumed,
  replayEnded,
  replaySpeedSet,
  replayTicked,
  selectFlowGraphPanelState,
  type ReplayState,
  type ReplaySpeed,
} from "@/redux/slices/flow-graph-panels-slice";
import {
  useStepRunInfo,
  type StepRunInfo,
} from "@/components/workbench/shared/flow-graph/use-step-run-info";
import { useReplayClock } from "./use-replay-clock";

export type ReplayToggleAction =
  | { type: "start"; startCutoffTime: number }
  | { type: "pause" }
  | { type: "resume" };

// Pure -- the three-way "which action does pressing Play/Pause dispatch"
// decision, extracted so it's unit-testable with plain data. This app has
// no jsdom/@testing-library/react-test-renderer set up anywhere, so
// useFlowGraphReplay itself (the Redux-wired hook below) isn't
// independently unit-tested -- same reasoning as use-replay-clock.ts's own
// computeTickOutcome extraction.
export function decideReplayToggle(
  replay: ReplayState | null,
  firstEventTime: number,
): ReplayToggleAction {
  if (!replay) return { type: "start", startCutoffTime: firstEventTime };
  return replay.status === "playing" ? { type: "pause" } : { type: "resume" };
}

// Pure -- null cutoffTime (idle) returns `events` itself, unchanged by
// reference, so a caller memoizing on this doesn't invalidate downstream
// memoization while idle just because this ran again.
export function filterEventsUpTo(
  events: AnyEvent[],
  cutoffTime: number | null,
): AnyEvent[] {
  if (cutoffTime === null) return events;
  return events.filter((e) => Date.parse(e.time) <= cutoffTime);
}

// Owns the Redux read/dispatch side of replay (the generic useReplayClock
// knows nothing about either) and the effective-stepRunInfo swap: while
// idle, the caller's already-computed stepRunInfo passes through
// unchanged; while replaying, a second useStepRunInfo fold runs over a
// filtered, memoized subset of events instead -- FlowGraph/StepResultsTab
// never know the difference, since both already just consume stepRunInfo
// as an opaque prop from one shared derivation point.
export function useFlowGraphReplay(
  panelId: string,
  events: AnyEvent[],
  stepIds: string[],
  stepRunInfo: Record<string, StepRunInfo>,
  replayAvailable: boolean,
): {
  replay: ReplayState | null;
  replaySpeed: ReplaySpeed;
  effectiveStepRunInfo: Record<string, StepRunInfo>;
  handleTogglePlayPause: () => void;
  handleCancelReplay: () => void;
  handleSetReplaySpeed: (speed: ReplaySpeed) => void;
} {
  const dispatch = useAppDispatch();
  const { replay, replaySpeed } = useAppSelector((state) =>
    selectFlowGraphPanelState(state, panelId),
  );

  // CloudEvent.time is an ISO string -- converted to epoch ms once, here,
  // at the boundary. Neither the reducer nor useReplayClock ever sees the
  // string form.
  const eventTimes = useMemo(
    () => events.map((e) => Date.parse(e.time)),
    [events],
  );

  useReplayClock({
    status: replay?.status ?? "idle",
    cutoffTime: replay?.cutoffTime ?? 0,
    eventTimes,
    speed: replaySpeed,
    onTick: (cutoffTime) => dispatch(replayTicked({ panelId, cutoffTime })),
    onFinished: () => dispatch(replayEnded({ panelId })),
  });

  const handleTogglePlayPause = () => {
    if (!replayAvailable) return;
    const action = decideReplayToggle(
      replay,
      events[0] ? Date.parse(events[0].time) : 0,
    );
    if (action.type === "start") {
      dispatch(
        replayStarted({ panelId, startCutoffTime: action.startCutoffTime }),
      );
    } else if (action.type === "pause") {
      dispatch(replayPaused({ panelId }));
    } else {
      dispatch(replayResumed({ panelId }));
    }
  };

  const handleCancelReplay = () => {
    dispatch(replayEnded({ panelId }));
  };

  const handleSetReplaySpeed = (speed: ReplaySpeed) => {
    dispatch(replaySpeedSet({ panelId, speed }));
  };

  // Memoized on the cutoff itself, not recomputed inline every render --
  // mirrors use-flow-graph-panel.ts's own stepIds memo, which exists for
  // the identical reason: a fresh array by reference invalidates
  // useStepRunInfo's (and, downstream, FlowGraph's) memoization on every
  // unrelated re-render, e.g. clicking a step while replay keeps playing.
  const filteredEvents = useMemo(
    () => filterEventsUpTo(events, replay?.cutoffTime ?? null),
    [events, replay?.cutoffTime],
  );

  const replayStepRunInfo = useStepRunInfo(filteredEvents, stepIds);
  const effectiveStepRunInfo = replay ? replayStepRunInfo : stepRunInfo;

  return {
    replay,
    replaySpeed,
    effectiveStepRunInfo,
    handleTogglePlayPause,
    handleCancelReplay,
    handleSetReplaySpeed,
  };
}
