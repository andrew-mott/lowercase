import { useMemo } from "react";
import type {
  AnyEvent,
  StepCompletedData,
  StepEvent,
  StepFailedData,
  StepReusedData,
  StepStartedData,
} from "@lcase/types";

/**
 * Deliberately narrower than the engine's own StepContext["status"]
 * (packages/types/src/engine/run-context.ts) — that type also has "planned"
 * and "reused" as distinct states, and uses "started" rather than "running".
 * This hook never assigns "planned" (step.planned isn't a status event we
 * listen to) and folds "reused" into completed/failed based on the reused
 * event's own outcome, so it's a UI-specific projection, not a reused alias.
 */
export type StepStatus = "initialized" | "running" | "completed" | "failed";

export type StepRunInfo = {
  status: StepStatus;
  outputHash?: string;
  exportHashes?: Record<string, string>;
  reason?: string;
  matchedCase?: string | null;
  sourceRunId?: string;
};

type StatusEventType =
  "step.started" | "step.completed" | "step.failed" | "step.reused";
type StatusEventData =
  StepStartedData | StepCompletedData | StepFailedData | StepReusedData;

const STATUS_EVENT_TYPES = new Set<StatusEventType>([
  "step.started",
  "step.completed",
  "step.failed",
  "step.reused",
]);

function isStatusEvent(event: AnyEvent): event is StepEvent<StatusEventType> {
  return STATUS_EVENT_TYPES.has(event.type as StatusEventType);
}

export function deriveStepRunInfo(
  events: AnyEvent[],
  stepIds: string[],
): Record<string, StepRunInfo> {
  const info: Record<string, StepRunInfo> = Object.fromEntries(
    stepIds.map((id) => [id, { status: "initialized" as StepStatus }]),
  );
  for (const event of events) {
    if (!isStatusEvent(event)) continue;
    const stepId = event.stepid;
    if (!stepId || !(stepId in info)) continue;

    const data = event.data as StatusEventData;
    info[stepId] = {
      status:
        data.status === "started"
          ? "running"
          : data.status === "success"
            ? "completed"
            : "failed",
      outputHash: "outputHash" in data ? data.outputHash : undefined,
      exportHashes: "exportHashes" in data ? data.exportHashes : undefined,
      reason: "reason" in data ? data.reason : undefined,
      matchedCase: "matchedCase" in data ? data.matchedCase : undefined,
      sourceRunId: "sourceRunId" in data ? data.sourceRunId : undefined,
    };
  }
  return info;
}

export function useStepRunInfo(
  events: AnyEvent[],
  stepIds: string[],
): Record<string, StepRunInfo> {
  return useMemo(() => deriveStepRunInfo(events, stepIds), [events, stepIds]);
}
