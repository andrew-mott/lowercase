/**
 * Reports that a run's terminal status has been written to the projection.
 *
 * This is not the run.completed event: that fires before the projection is
 * written, so a reader that woke on it could still find the run unfinished.
 */
export interface RunSettledPublisherPort {
  settled(runId: string): void;
}

export type RunSettledWait = {
  // Resolves when the run settles after the wait was registered. A run that
  // settled earlier is never remembered, so a caller registers first and then
  // reads the run's current status.
  promise: Promise<void>;
  cancel(): void;
};

export interface RunSettledWaiterPort {
  whenSettled(runId: string): RunSettledWait;
}
