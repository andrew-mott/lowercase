import {
  WorkflowController,
  type WorkflowRuntimeHandle,
} from "@lcase/controller";

// apps/desktop is never built, tested, or run right now -- this is a
// preserved-shape placeholder, not a working runtime. Satisfies
// WorkflowController's dependency so the archived Electron shell keeps
// type-checking without pulling in the real @lcase/runtime composition
// code, which this package no longer needs to depend on at all.
const inertRuntime: WorkflowRuntimeHandle = {
  async startRuntime() {
    return "stopped";
  },
  async stopRuntime() {
    return "stopped";
  },
  attachSink() {},
  replay: {
    async replayRun() {},
  },
};

export function bootstrap(): { controller: WorkflowController } {
  const controller = new WorkflowController(inertRuntime);
  return { controller };
}
