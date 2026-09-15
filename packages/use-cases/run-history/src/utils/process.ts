import type { AnyEvent, RunIndex } from "@lcase/types";
import { getDuration } from "./get-duration.js";

/**
 * A few functions that mutates a supplied index based on the event it receives.
 */

export function processRunRequested(
  event: AnyEvent<"run.requested">,
  index: RunIndex,
) {
  index.flowDefHash = event.data.flowDefHash;
  index.forkSpecHash = event.data.forkSpecHash;
  index.params = event.data.params;
}
export function processRunStarted(
  event: AnyEvent<"run.started">,
  index: RunIndex,
): void {
  index.startTime = event.time;
}

export function processRunFinished(
  event: AnyEvent<"run.completed"> | AnyEvent<"run.failed">,
  index: RunIndex,
): void {
  index.endTime = event.time;
  index.duration = getDuration(index.startTime, index.endTime);
}

export function processStepStarted(
  event: AnyEvent<"step.started">,
  index: RunIndex,
): void {
  index.steps[event.stepid] ??= {};
  index.steps[event.stepid].startTime = event.time;
  index.steps[event.stepid].status = event.data.status;
}

export function processStepFinished(
  event: AnyEvent<"step.completed"> | AnyEvent<"step.failed">,
  index: RunIndex,
): void {
  index.steps[event.stepid] ??= {};
  const step = index.steps[event.stepid];
  step.endTime = event.time;
  step.outputHash = event.data.outputHash;
  step.exportHashes = event.data.exportHashes;
  step.status = event.data.status;
  step.duration = getDuration(step.startTime, step.endTime);
}

export function processStepReused(
  event: AnyEvent<"step.reused">,
  index: RunIndex,
) {
  index.steps[event.stepid] ??= {};
  const step = index.steps[event.stepid];
  step.outputHash = event.data.outputHash;
  step.exportHashes = event.data.exportHashes;
  step.status = event.data.status;
  step.wasReused = true;
  step.reusedTime = event.time;
}
