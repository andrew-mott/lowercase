import type { ReplayServicePort } from "@lcase/ports";
import type { ReplayEnginePort } from "@lcase/ports/replay";

export class ReplayService implements ReplayServicePort {
  constructor(private replay: ReplayEnginePort) {}

  async replayRun(runId: string) {
    await this.replay.emitReplayMode(runId, false);
    await this.replay.replayAllEvents(runId);
  }

  async getAllEvents(runId: string) {
    const events = await this.replay.getAllEvents(runId);
    return { events };
  }
}
