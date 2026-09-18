import type {
  ConsumerStreamPort,
  ProducerStreamPort,
  Chunk,
  InputChunk,
  StreamStatus,
} from "@lcase/ports";

// NOTE: not exported to public (internal package)
// NOTE: we use a core here to then create ConsumerStream and ProducerStream
// views, because consumers dont need to push, and producers dont need to
// subscribe, etc.
// But the stream needs to have one identity.
// the StreamRegistry produces these "views".
// Those views are public, thus this class is internal and named "core",
// it should not be exported to public.

type DeferredResolve<NextValue> = (v: NextValue) => void;
type DeferredReject = (e?: unknown) => void;
type Deferred<NextValue> = {
  promise: Promise<NextValue>;
  resolve: DeferredResolve<NextValue>;
  reject: DeferredReject;
};
const DONE = Symbol("done"); // producer done + nothing left in queue;
type NextValue = Chunk | typeof DONE;

// helper not exported, module scoped
function createDeferred<NextValue>(): Deferred<NextValue> {
  let resolve!: DeferredResolve<NextValue>;
  let reject!: DeferredReject;
  const promise = new Promise<NextValue>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * InMemoryStreamCore class implements stream adapters for an
 * in memory version of the stream core.  Internal use only.
 * ConsumerStream and ProducerStream exports views with scoped
 * methods appropriate for each class.
 */
export class InMemoryStreamCore
  implements ConsumerStreamPort, ProducerStreamPort
{
  #buffer: Chunk[] = [];
  #waiters: Deferred<NextValue>[] = [];
  #status: StreamStatus = "idle";
  #isProducerDone = false; // producer signaled the end of input

  #isClosed = false; // fully closed stream; terminated;
  #error: unknown = null;
  #nextSeq = 0;
  #iter: AsyncIterableIterator<Chunk> | null = null;

  private static readonly DONE = Symbol("done");

  constructor(private readonly streamId: string) {}
  /**
   * Return stream id (string)
   * @returns stream id (string)
   */
  id(): string {
    return this.streamId;
  }
  /**
   * Overall status of the stream.
   * @returns StreamStatus type.
   */
  status(): StreamStatus {
    return this.#status;
  }
  /**
   * Producer marks an end to sending streaming data.
   * @returns void
   * @description Producer should call this to mark the end of sending data
   * into the stream.
   *
   * Stream stays open until producer calls end() and internal buffer is empty.
   * @see close() method for hard shutting down a stream.
   */
  async end(): Promise<void> {
    if (this.#isProducerDone || this.#isClosed) return;
    this.#isProducerDone = true;
    this.#status = "ended";
    if (this.#buffer.length === 0) this.#resolveAllWaitersDone();
  }
  /**
   * Hard closes the stream and empties buffer for consumer and producer.
   * @returns Promise<void>
   */
  async close(): Promise<void> {
    if (this.#isClosed) return;
    this.#isClosed = true;
    this.#status = "closed";
    this.#buffer.length = 0; // empty buffer
    this.#resolveAllWaitersDone();
  }

  /**
   * Get an async iterable object that returns chunks.
   * Call once, repeated calls return the same object.
   * @returns AsyncIterable object that returns chunks
   */
  subscribe(): AsyncIterableIterator<Chunk> {
    // if already returned a generator, return the same generator
    if (this.#iter) return this.#iter;
    if (this.#status === "idle") this.#status = "open";

    // Async generators can't be arrow functions, so this is how the
    // generator body below reaches the outer instance's private fields.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const core = this;

    async function* generator(): AsyncGenerator<Chunk> {
      try {
        while (true) {
          const value = await core.#getNextValue();
          if (value === DONE) break; // return iterator {done: true}
          yield value;
        }
      } finally {
        // emit observability here
        // NOTE: later support shutdown if producer is done,
        // or some way to inform producers that consumer is
        // no longe listening
      }
    }

    this.#iter = generator();
    return this.#iter;
  }
  /**
   * Producer method to send data to an open stream
   * @param data
   * @returns Promise<void>
   */
  async send(data: InputChunk): Promise<void> {
    if (this.#isClosed) throw new Error("stream is closed");
    if (this.#isProducerDone) throw new Error("producer already ended");

    if (this.#status === "idle" || this.#status === "open") {
      this.#status = "active";
    }

    const chunk: Chunk = {
      ...data,
      ts: Date.now(),
      seq: this.#nextSeq++,
    };

    console.log("[stream-core] data:", data.payload);

    const waiter = this.#waiters.shift();
    if (waiter) {
      // delay promise resolution until later to prevent timing problems
      queueMicrotask(() => waiter.resolve(chunk));
      return;
    }
    this.#buffer.push(chunk);
    return;
  }

  /**
   * Gets next value for async iterator.  Either a chunk or DONE
   * @returns Promise<NextValue>
   */
  async #getNextValue(): Promise<NextValue> {
    if (this.#error) return Promise.reject(this.#error);
    if (this.#buffer.length > 0) {
      if (this.#status === "open") this.#status = "active";
      return this.#buffer.shift()!;
    }

    // inform consumer if stream is closed or buffer/producer is done
    if (this.#isClosed) return DONE;
    if (this.#isProducerDone && this.#buffer.length === 0) return DONE;

    const deferred = createDeferred<NextValue>();
    this.#waiters.push(deferred);
    return deferred.promise;
  }

  /**
   * Empties waiters and resolves them all with DONE
   * @returns void
   */
  #resolveAllWaitersDone(): void {
    if (this.#waiters.length === 0) return;
    const list = this.#waiters.splice(0); // remove + resolve all waiters
    for (const w of list) queueMicrotask(() => w.resolve(DONE));
  }
  /**
   * Empties waiters and rejects all with error
   * @param err
   * @returns void
   */
  #rejectAllWaiters(err: unknown): void {
    if (this.#waiters.length === 0) return;
    const list = this.#waiters.splice(0); // remove + reject all waiters
    for (const w of list) queueMicrotask(() => w.reject(err));
  }

  /**
   * Not yet utilized, but a failure cleanup method
   * @param err
   * @returns void
   */
  // Reserved for when a producer-side failure path actually calls it.
  // eslint-disable-next-line no-unused-private-class-members
  #fail(err: unknown): void {
    if (this.#isClosed) return;
    this.#status = "error";
    this.#error = err;
    this.#rejectAllWaiters(err);
  }
}
