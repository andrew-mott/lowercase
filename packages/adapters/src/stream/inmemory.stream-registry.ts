import { InMemoryStreamCore } from "./internal/inmemory.stream-core.js";
import { makeProducerView, makeConsumerView } from "./internal/views.js";
import type {
  ConsumerStreamPort,
  ProducerStreamPort,
  StreamHandles,
  StreamRegistryPort,
} from "@lcase/ports";

// currently imports InMemoryStream core for dependency.
// NOTE: let registry accept a *factory* arg; createCore(id, options) -> Core
// plug in different cores (redis, kafka, etc) without touching callers.
// DI through tiny function to create the Core instead of importing for
// other cores.

export class InMemoryStreamRegistry implements StreamRegistryPort {
  #registry = new Map<
    string,
    { p: ProducerStreamPort; c: ConsumerStreamPort; s: InMemoryStreamCore }
  >();
  constructor() {}

  createStream(streamId: string): StreamHandles {
    const streamCore = new InMemoryStreamCore(streamId); // later move to factory function for DI

    const consumer = makeConsumerView(streamCore);
    const producer = makeProducerView(streamCore);

    this.#registry.set(streamId, { p: producer, c: consumer, s: streamCore });

    return { id: streamId, consumer, producer };
  }
  getProducer(streamId: string): ProducerStreamPort {
    if (!this.#registry.has(streamId)) {
      throw new Error(`[stream-registry] no registry for id:${streamId}`);
    }
    const { p } = this.#registry.get(streamId)!;
    return p;
  }
  getConsumer(streamId: string): ConsumerStreamPort {
    if (!this.#registry.has(streamId)) {
      throw new Error(`[stream-registry] no registry for id:${streamId}`);
    }
    const { c } = this.#registry.get(streamId)!;
    return c;
  }
  async closeStream(streamId: string): Promise<void> {
    if (!this.#registry.has(streamId)) {
      console.error(
        `[inmemory-stream-registry] cannot close stream: ${streamId}`,
      );
      return;
    }
    const { s } = this.#registry.get(streamId)!;
    await s.close();
    this.#registry.delete(streamId);
  }
}
