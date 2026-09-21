import type {
  RunSettledPublisherPort,
  RunSettledWait,
  RunSettledWaiterPort,
} from "@lcase/ports";

/**
 * Waiters and the publisher share one process, which holds while observability
 * runs beside the API. Once they split, this is what a Message replaces.
 */
export class InMemoryRunSettledNotifier
  implements RunSettledPublisherPort, RunSettledWaiterPort
{
  #waiters = new Map<string, Set<() => void>>();

  whenSettled(runId: string): RunSettledWait {
    let resolveWait!: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveWait = resolve;
    });

    const waiters = this.#waiters.get(runId) ?? new Set();
    waiters.add(resolveWait);
    this.#waiters.set(runId, waiters);

    return { promise, cancel: () => this.#remove(runId, resolveWait) };
  }

  settled(runId: string): void {
    const waiters = this.#waiters.get(runId);
    if (!waiters) return;
    this.#waiters.delete(runId);
    for (const resolve of waiters) resolve();
  }

  #remove(runId: string, resolve: () => void): void {
    const waiters = this.#waiters.get(runId);
    if (!waiters) return;
    waiters.delete(resolve);
    if (waiters.size === 0) this.#waiters.delete(runId);
  }
}
