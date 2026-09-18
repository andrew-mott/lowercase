export type SemaphoreAcquireOutcome =
  { kind: "acquired"; release: () => void } | { kind: "cancelled" };

export interface Semaphore {
  acquire(signal?: AbortSignal): Promise<SemaphoreAcquireOutcome>;
  readonly available: number;
}

export function createSemaphore(max: number): Semaphore {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(
      `createSemaphore: max must be a positive integer, got ${max}`,
    );
  }

  let available = max;

  type Entry = { settle: (outcome: SemaphoreAcquireOutcome) => void };
  const queue: Entry[] = [];

  function release(): void {
    const next = queue.shift();
    if (next) {
      next.settle({ kind: "acquired", release });
      return;
    }
    available += 1;
  }

  function acquire(signal?: AbortSignal): Promise<SemaphoreAcquireOutcome> {
    if (signal?.aborted) {
      return Promise.resolve({ kind: "cancelled" });
    }
    if (available > 0) {
      available -= 1;
      return Promise.resolve({ kind: "acquired", release });
    }

    return new Promise((resolve) => {
      const entry: Entry = {
        settle: (outcome) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(outcome);
        },
      };

      function onAbort() {
        const idx = queue.indexOf(entry);
        // Already granted (shifted out by release()) -- a late-firing abort
        // is a correct no-op, not a race to guard against further.
        if (idx === -1) return;
        queue.splice(idx, 1);
        entry.settle({ kind: "cancelled" });
      }

      queue.push(entry);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  return {
    acquire,
    get available() {
      // get here to write protect (no-op) `available` property
      return available;
    },
  };
}
