import type {
  ServerControllerPort,
  EventSink,
  RuntimeStatus,
} from "@lcase/ports";

// Decoupled from @lcase/runtime on purpose -- this package is archived
// reference scaffolding (see CLAUDE.md), not a live dependent of the
// runtime's composition code. This is the whole shape WorkflowController
// actually uses (confirmed by reading this file, not assumed): no .flow or
// .sim needed, despite the old WorkflowRuntime class exposing them.
export type WorkflowRuntimeHandle = {
  startRuntime(): Promise<RuntimeStatus>;
  stopRuntime(): Promise<RuntimeStatus>;
  attachSink(sink: EventSink): void;
  replay: {
    replayRun(runId: string): Promise<void>;
  };
};

export class WorkflowController implements ServerControllerPort {
  constructor(private readonly runtime: WorkflowRuntimeHandle) {}

  async startRuntime(): Promise<RuntimeStatus> {
    return await this.runtime.startRuntime();
  }
  async stopRuntime(): Promise<RuntimeStatus> {
    return await this.runtime.stopRuntime();
  }
  attachSink(sink: EventSink) {
    this.runtime.attachSink(sink);
  }

  async replayRun(runId: string) {
    await this.runtime.replay.replayRun(runId);
  }
}
