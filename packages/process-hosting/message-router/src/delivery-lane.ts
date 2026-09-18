import type {
  DeliveredMessage,
  ReportDeliveryFailure,
} from "./delivery.types.js";

// Re-exported so the lane's own importers keep one import site, while the
// definitions live where both carriers can reach them.
export type {
  DeliveredMessage,
  DeliveryFailure,
  ReportDeliveryFailure,
} from "./delivery.types.js";

/**
 * One delivery offered to a lane.
 *
 * `retire` is how a carrier that owes its source an outcome settles up --
 * a log-backed one acknowledges the entry it read. It runs after the handler
 * settles, success or failure, and before the lane frees the slot, which is
 * what keeps an acknowledgement from racing ahead of the work it covers. An
 * in-process delivery has nothing to retire and omits it.
 */
export type LaneItem = {
  message: DeliveredMessage;
  retire?: () => Promise<void>;
};

type QueuedItem = LaneItem & { settled: () => void };

export type DeliveryLaneDeps = {
  subscriptionId: string;
  invoke: (message: DeliveredMessage) => Promise<void>;
  maxInFlight: number;
  reportFailure: ReportDeliveryFailure;
  /** Router bookkeeping: one settled delivery, success or failure. */
  onSettled: () => void;
};

/**
 * One logical subscription's private FIFO queue and processing loop.
 *
 * Carrier-neutral on purpose: it knows a handler, a concurrency bound, and how
 * to report a failure, and nothing about where a Message came from. That is
 * what lets one subscription selecting several topics own exactly one of
 * these, whichever carrier is feeding it -- one in-process publisher per
 * selected topic enqueueing here, or several Redis readers doing the same. With
 * `maxInFlight: 1` that single lane is what settles the order between them.
 *
 * Runtime-private by design: it is never handed to a component and is not a
 * port. A component sees only its handler being called.
 *
 * Unbounded on purpose for now -- bounded capacity needs an overflow policy
 * that does not deadlock cyclic publishing, which is separate design work.
 * Process memory is the only limit, and a sustained producer/consumer mismatch
 * will find it.
 */
export class DeliveryLane {
  readonly #queue: QueuedItem[] = [];
  readonly #deps: DeliveryLaneDeps;
  #inFlight = 0;
  #scheduled = false;

  constructor(deps: DeliveryLaneDeps) {
    this.#deps = deps;
  }

  /**
   * Resolves once this delivery has settled and been retired -- never rejects,
   * because a failed handler is reported and dropped rather than thrown.
   *
   * A caller that needs backpressure awaits it; a log-backed reader does
   * exactly that, so the lane's `maxInFlight` bounds how far ahead of the
   * handler it can read. An in-process publisher ignores it, which is why
   * ignoring it cannot produce an unhandled rejection.
   */
  enqueue(item: LaneItem): Promise<void> {
    return new Promise<void>((resolve) => {
      this.#queue.push({ ...item, settled: resolve });
      this.#schedule();
    });
  }

  // Dispatch is always deferred, never run inside the caller's stack. That is
  // what keeps a chain like engine publishes -> worker handles -> worker
  // publishes -> engine handles from re-entering the engine inside the
  // original publish() call.
  #schedule(): void {
    if (this.#scheduled) return;
    if (this.#queue.length === 0) return;
    if (this.#inFlight >= this.#deps.maxInFlight) return;

    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.#pump();
    });
  }

  #pump(): void {
    while (this.#queue.length > 0 && this.#inFlight < this.#deps.maxInFlight) {
      const item = this.#queue.shift();
      if (!item) return;
      this.#inFlight += 1;
      void this.#deliver(item);
    }
  }

  async #deliver(item: QueuedItem): Promise<void> {
    try {
      await this.#deps.invoke(item.message);
    } catch (error) {
      // One reported attempt, then the delivery is dropped. No retry: retrying
      // before handler side effects are known to be idempotent would turn one
      // failure into repeated external work.
      this.#report(item.message, error);
    } finally {
      // Inside the slot rather than after it: a carrier that acknowledges its
      // source is still finishing this delivery until that succeeds or is
      // reported, and a failure to retire must not take the loop down.
      if (item.retire) {
        try {
          await item.retire();
        } catch (error) {
          this.#report(item.message, error);
        }
      }
      this.#inFlight -= 1;
      this.#schedule();
      this.#deps.onSettled();
      item.settled();
    }
  }

  #report(message: DeliveredMessage, error: unknown): void {
    try {
      this.#deps.reportFailure({
        subscriptionId: this.#deps.subscriptionId,
        messageId: message.id,
        messageType: message.type,
        source: message.source,
        error,
      });
    } catch {
      // A failing reporter must never take the processing loop down with it.
    }
  }
}
