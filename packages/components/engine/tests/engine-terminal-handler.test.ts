import { buildEvent } from "@lcase/events";
import type { EmitterFactoryPort, EventBusPort } from "@lcase/ports";
import { describe, expect, it, vi } from "vitest";
import { Engine } from "../src/engine.js";
import { stepPlannedNewState } from "./fixtures/step-planned.state.js";

// The engine under test needs only enough to construct: the terminal handler
// path touches its own state, not the bus or any port.
function makeEngine() {
  const bus = {
    subscribe: vi.fn(),
    publish: vi.fn(),
  } as unknown as EventBusPort;
  const engine = new Engine({
    bus,
    ef: {} as EmitterFactoryPort,
    jobParser: {} as never,
    runQuery: {} as never,
    artifacts: {} as never,
    jobCommands: { publish: vi.fn() },
  });
  // Side effects off: advancing this step would otherwise fan out into effects
  // that need collaborators this test deliberately does not supply.
  engine.enableSideEffects = false;
  engine.state = structuredClone(stepPlannedNewState);
  return engine;
}

function terminal(status: "completed" | "failed") {
  return status === "completed"
    ? buildEvent(
        "job.httpjson.completed",
        { status: "success", output: "output-hash" },
        {
          flowid: "test-flowid",
          flowversionid: "test-flowversionid",
          runid: "test-runid",
          stepid: "parallel",
          jobid: "job-1",
          capid: "httpjson",
          toolid: "httpjson",
          source: "lowercase://worker",
        },
      )
    : buildEvent(
        "job.httpjson.failed",
        { status: "failure", output: null, message: "upstream said no" },
        {
          flowid: "test-flowid",
          flowversionid: "test-flowversionid",
          runid: "test-runid",
          stepid: "parallel",
          jobid: "job-1",
          capid: "httpjson",
          toolid: "httpjson",
          source: "lowercase://worker",
        },
      );
}

describe("Engine.handleJobTerminal", () => {
  it("advances the run from a delivered completed Message", async () => {
    const engine = makeEngine();

    await engine.handleJobTerminal(terminal("completed"));

    const step = engine.getState().runs["test-runid"]!.steps["parallel"]!;
    expect(step.status).toBe("completed");
    expect(step.outputHash).toBe("output-hash");
  });

  it("advances the run from a delivered failed Message", async () => {
    const engine = makeEngine();

    await engine.handleJobTerminal(terminal("failed"));

    expect(
      engine.getState().runs["test-runid"]!.steps["parallel"]!.status,
    ).toBe("failed");
  });

  // The handler feeds the literal delivered Message into the existing path
  // rather than rebuilding anything: worker constructed that Message, and a
  // reconstruction here would be a second version of one occurrence.
  it("enqueues the delivered Message itself, unmodified", async () => {
    const engine = makeEngine();
    const enqueue = vi.spyOn(engine, "enqueue");
    const message = terminal("completed");

    await engine.handleJobTerminal(message);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]![0]).toEqual({
      type: "JobFinished",
      event: message,
    });
    expect((enqueue.mock.calls[0]![0] as { event: unknown }).event).toBe(
      message,
    );
  });

  // Synchronous by the time the handler resolves -- which is what makes
  // awaiting a delivery a sound signal that state has moved.
  it("has already advanced state when it resolves", async () => {
    const engine = makeEngine();

    const pending = engine.handleJobTerminal(terminal("completed"));
    await pending;

    expect(
      engine.getState().runs["test-runid"]!.completedSteps["parallel"],
    ).toBe(true);
  });
});
