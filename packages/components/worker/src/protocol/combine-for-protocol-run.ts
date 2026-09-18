export type ProtocolAbortCause = "caller" | "timeout";

export type CombinedProtocolSignal = {
  signal: AbortSignal;
  cause(): ProtocolAbortCause | undefined;
  dispose(): void;
};

// Combines the caller's cancellation signal with the worker's own protocol
// timeout into one signal for fetch, while separately tracking WHICH source
// fired first. AbortSignal.any() can't report which input caused it -- and
// checking both signals' *current* state after the fact is insufficient: a
// timeout that fires first, followed shortly by a caller abort before the
// rejection is even caught, would read both as aborted and misclassify the
// timeout as a cancellation. Recording cause the instant each source's own
// "abort" event fires avoids that race entirely.
export function combineForProtocolRun(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): CombinedProtocolSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;

  let cause: ProtocolAbortCause | undefined;
  const markCaller = () => {
    if (cause === undefined) cause = "caller";
  };
  const markTimeout = () => {
    if (cause === undefined) cause = "timeout";
  };

  if (callerSignal?.aborted) {
    cause = "caller";
  } else if (timeoutSignal.aborted) {
    cause = "timeout";
  } else {
    callerSignal?.addEventListener("abort", markCaller, { once: true });
    timeoutSignal.addEventListener("abort", markTimeout, { once: true });
  }

  return {
    signal,
    cause: () => cause,
    dispose: () => {
      callerSignal?.removeEventListener("abort", markCaller);
      timeoutSignal.removeEventListener("abort", markTimeout);
    },
  };
}
