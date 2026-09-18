import type { EventStorePort } from "@lcase/ports/event-store";
import type { ReplayEnginePort } from "@lcase/ports/replay";
import type { EmitterFactoryPort, EventBusPort } from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";
export class ReplayEngine implements ReplayEnginePort {
  constructor(
    private readonly store: EventStorePort,
    private readonly bus: EventBusPort,
    private readonly ef: EmitterFactoryPort,
  ) {}

  async replayAllEvents(runId: string) {
    for await (const event of this.store.iterateAllEvents(runId)) {
      await this.bus.publish(event.type, event, { internal: true });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    }
  }

  async emitReplayMode(runId: string, enableSideEffects: boolean) {
    const emitter = this.ef.newReplayEmitterNewTrace({
      source: "lowercase://replay",
      runid: runId,
    });

    await emitter.emit("replay.mode.submitted", {
      enableSideEffects,
    });
  }

  async getAllEvents(runId: string): Promise<AnyEvent[]> {
    const events: AnyEvent[] = [];
    for await (const event of this.store.iterateAllEvents(runId)) {
      events.push(event);
    }
    return events;
  }
}
