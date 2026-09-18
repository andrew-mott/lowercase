import type {
  EventBusPort,
  EventSink,
  ObservabilityTapPort,
} from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";

export class ObservabilityTap implements ObservabilityTapPort {
  #subscribeTopic = "observability";
  #sinks = new Map<string, EventSink>();

  constructor(
    private readonly bus: EventBusPort,
    sinks?: EventSink[],
  ) {
    if (sinks) sinks.forEach((s) => this.#sinks.set(s.id, s));
  }

  start() {
    this.bus.subscribe(this.#subscribeTopic, (event: AnyEvent) =>
      this.ingest(event),
    );
  }

  /**
   * Fan one event to every configured sink, best-effort: a failing sink is
   * reported and the rest still run.
   *
   * Public and bus-independent so an event can reach observability by any
   * route -- the legacy bus subscription above is one caller, and a Message
   * subscription is another. Both get identical fan-out because there is only
   * one loop.
   */
  async ingest(event: AnyEvent): Promise<void> {
    for (const sink of this.#sinks.values()) {
      try {
        await sink.handle(event);
      } catch (err) {
        console.error(
          `[observability-tap] sink '${sink.id}' failed to handle event: ${err}`,
        );
      }
    }
  }

  attachSink(sink: EventSink) {
    this.#sinks.set(sink.id, sink);
  }

  detachSink(sink: EventSink) {
    this.#sinks.delete(sink.id);
  }
  stop() {
    try {
      this.bus.close();
    } catch (err) {
      console.log(`[observability-tap] could not close: ${err}`);
    }
  }
}
