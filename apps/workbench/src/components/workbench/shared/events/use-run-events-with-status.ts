import { useRef } from "react";
import { shallowEqual } from "react-redux";
import { skipToken } from "@reduxjs/toolkit/query";
import { useAppSelector } from "@/redux/typed-hooks";
import { useGetAllRunEventsQuery } from "@/redux/api/runs-api";
import { makeSelectRunEvents } from "@/redux/slices/events-slice";
import { useStepRunInfo } from "@/components/workbench/shared/flow-graph/use-step-run-info";

// given a runId, backfills its events over REST and derives step run info
// (status + output/export hashes) from them -- identical for a live run and
// a historical one, since both are just a fold over an event array
export function useRunEventsWithStatus(
  runId: string | null,
  stepIds: string[],
) {
  const selectRunEventsRef = useRef(makeSelectRunEvents());
  const events = useAppSelector(
    (s) => selectRunEventsRef.current(s, runId),
    shallowEqual,
  );
  const { isFetching } = useGetAllRunEventsQuery(runId ? { runId } : skipToken);

  const stepRunInfo = useStepRunInfo(events, stepIds);

  return { events, stepRunInfo, isFetching };
}
